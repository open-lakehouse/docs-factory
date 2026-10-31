---
title: One proto file, a whole app — the Trestle golden path
slug: trestle-golden-path
status: draft
tags: [lakehouse, rust, codegen, unity-catalog]
series: Chef Casper's Ghost Kitchen
series_order: 1
author: Robert Pack
target: openlakehouse
post_type: how-to
audience: Backend and platform engineers who know protobuf, REST, and basic Rust, but not ConnectRPC or codegen frameworks.
summary: Annotate a few proto messages, run one tool, and get a Rust app serving REST and Connect on one port from one hand-written core.
---

<!-- Draft in progress. Sections other than "Who's asking?" are stubs that follow
     the brief's outline; see brief.md for beats and sources. -->

## The app that's too small for a backend project

*Stub:* Casper's problem — who's checked in, which order did they take — and the
golden-path promise.

## Model the domain in proto

*Stub:* the `Driver` / `Order` resources, field behaviors, proto as source of truth.

## One command, a running app

*Stub:* `trestle new` / `trestle generate` and what lands.

## One core, two protocols, one port

*Stub:* the protocol-neutral core, the REST and Connect adapters, the
`Router::merge(...).fallback_service(...)` mount.

## Who's asking? One generic context, from the wire to the policy

The last section kept the core ignorant of the protocol. This section does the
same thing for the server around it. Every handler has to answer the question of
who is calling, and the easy answer is to hard-code it: read a header in the
handler, look up a user, call the permission check. That works until you want the
same handlers inside a different server, with a different notion of "user" and a
different idea of who may do what.

So the handlers don't answer it. They take the answer as a type parameter.

### The generic is the contract

Trestle never names a concrete context in a handler trait. It emits a type
parameter with a default:

```rust
// Generated (abridged). The default comes from `server.context_type` in trestle.yaml.
#[async_trait]
pub trait DriverHandler<Cx = crate::api::RequestContext>: Send + Sync + 'static {
    async fn check_in(&self, request: CheckInRequest, context: Cx) -> Result<Driver>;
    async fn get_driver(&self, request: GetDriverRequest, context: Cx) -> Result<Driver>;
}
```

The generated Axum route functions are generic in the same way. The only thing
they require of `Cx` is that Axum can extract it from a request:

```rust
// Generated (abridged).
pub async fn check_in<T, Cx>(
    State(handler): State<T>,
    context: Cx,
    request: CheckInRequest,
) -> Result<Json<Driver>>
where
    T: DriverHandler<Cx> + Clone + Send + Sync + 'static,
    Cx: FromRequestParts<T> + Send,
{
    Ok(Json(handler.check_in(request, context).await?))
}
```

This splits ownership cleanly. The crate that owns an API owns its routes,
request validation, and error envelope. The server that hosts it owns `Cx`: what
goes in it, how it gets filled, and how it is judged.

### Populated once, at the edge

Filling the context is the server's job, and it happens once, before any handler
runs. In mangrove that is a tower layer. An `Authenticator` turns the raw request
into an identity, and the middleware stores the identity in the request
extensions:

```rust
// mangrove: crates/server/src/rest/auth.rs (abridged)
pub trait Authenticator<I>: Send + Sync + 'static {
    fn authenticate(&self, request: &Request) -> Result<I>;
}

fn call(&mut self, mut req: Request) -> Self::Future {
    match self.authenticator.authenticate(&req) {
        Ok(identity) => {
            req.extensions_mut().insert(identity);
            self.inner.call(req).boxed()
        }
        Err(e) => async { Ok(Error::from(e).into_response()) }.boxed(),
    }
}
```

The authenticator is chosen in configuration: anonymous, or a reverse proxy
that forwards a user header. The handlers never see which one ran. An extractor
then turns the extension into the context type. In the golden-path app that is a
`FromRequestParts` impl you write yourself, reading the `x-forwarded-*` headers
Databricks Apps sets. In mangrove the context is just the principal:

```rust
// mangrove: crates/handlers/src/context.rs
pub struct RequestContext {
    pub recipient: Principal, // Anonymous | User(String)
}
```

### It travels by type, not by globals

Nothing reads the identity from a thread-local or a global. You pick `Cx` once,
when you mount the routes, and the compiler carries it through every route
function, into the handler, and into whatever the handler calls:

```rust
let rest = Router::new()
    .route("/v1/drivers", post(check_in::<Service, api::RequestContext>))
    .with_state(svc.clone());
```

If a handler needs the caller, it has `context: Cx` in its signature. If it
doesn't, the parameter is `_context` and the dependency is visible right there.

### How the layers fit together

```text
request
  └─ AuthenticationLayer      Authenticator<I> → identity into request extensions
      └─ extractor            extensions (+ path) → Cx
          └─ route fn<T, Cx>  generated; passes Cx through untouched
              └─ Handler<Cx>  your logic; calls the policy with &Cx
                  └─ Policy<Cx>  allow or deny
```

Each layer knows the type of the one next to it and nothing else. The auth layer
doesn't know about routes. The generated routes don't know what an identity is.
The policy doesn't know about HTTP.

### Where it lands: the policy

The bottom of that stack is a single trait, generic over the same `Cx`. One
method is required:

```rust
// mangrove: crates/server/src/policy/mod.rs (abridged)
#[async_trait]
pub trait Policy<Cx: Send + Sync + 'static>: Send + Sync + 'static {
    async fn authorize(
        &self,
        resource: &ResourceIdent,
        permission: &Permission,
        context: &Cx,
    ) -> Result<Decision>;

    // Provided: check, check_required, authorize_many, authorize_checked …
}
```

The resource and permission come from the request itself. Each request message
implements `SecuredAction`, which states the resource it targets and the
permission it needs:

```rust
impl SecuredAction for CreateTableRequest {
    fn resource(&self) -> ResourceIdent {
        ResourceIdent::table(ResourceName::new([
            self.catalog_name.as_str(), self.schema_name.as_str(), self.name.as_str(),
        ]))
    }
    fn permission(&self) -> &'static Permission { &Permission::Create }
}
```

The server handler holds an `Arc<dyn Policy<Cx>>`, and a blanket impl makes the
handler a policy itself. Authorizing a call takes one line at the top of the
method, and it can't pair the wrong permission with the wrong request:

```rust
self.check_required(&request, &context).await?;
```

### Why this matters: one API crate, two servers

This is where the design pays off. Mangrove's Delta API is a crate of its own,
built to be mounted by servers that aren't mangrove. It keeps every piece of
Delta semantics: the managed-table contract, commit arbitration, and building the
`loadTable` response. It asks the host for a narrow port, generic over the host's
context:

```rust
// mangrove: crates/delta-api/src/backend.rs (abridged)
#[async_trait]
pub trait DeltaBackend<Cx = ()>: Send + Sync + 'static {
    /// The single authorization seam, called before every user-facing operation.
    async fn authorize(&self, action: DeltaAction<'_>, cx: &Cx) -> BackendResult<()>;

    async fn resolve_table(&self, table: &TableRef, cx: &Cx) -> BackendResult<ResolvedTable>;
    // … data access only: create, delete, vend credentials, staging
}
```

`DeltaAction` is the crate's own vocabulary (`ReadTable`, `CreateTable`,
`VendTableCredential`, and so on). It is `#[non_exhaustive]`, so every host has
to decide what happens with an action it hasn't seen yet. The router is generic
over the host's Axum state, and it takes an async closure that builds `Cx`:

```rust
pub fn router_with_context_at<S, Cx>(
    base: &str,
    handler: Arc<dyn DeltaApiHandler<Cx>>,
    extract_cx: ContextExtractor<Cx>,
) -> Router<S>;
```

Mangrove plugs in its `RequestContext` and maps each action onto its `Policy`.
[Lakekeeper](https://github.com/lakekeeper/lakekeeper), an Iceberg REST catalog
with a very different authorization model, plugs in its own context. Its
extractor reads Lakekeeper's `RequestMetadata` and resolves the warehouse from
the URL:

```rust
// lakekeeper (work in progress): server/delta/context.rs, backend.rs (abridged)
pub(crate) struct DeltaRequestContext {
    metadata: RequestMetadata, // project, roles, actor, …
    warehouse_id: WarehouseId,
}

impl DeltaBackend<DeltaRequestContext> for LakekeeperDeltaBackend<C, A, S> {
    async fn authorize(&self, action: DeltaAction<'_>, cx: &DeltaRequestContext) -> BackendResult<()> {
        match action {
            DeltaAction::ReadTable { table } => {
                load_and_authorize_generic_table_operation(
                    &self.ctx.v1_state.authz, &cx.metadata, cx.warehouse_id,
                    namespace(&table.catalog, &table.schema)?, &table.table,
                    CatalogGenericTableAction::GetMetadata, /* … */
                ).await.map(|_| ())
            }
            // … writes not served yet
            _ => Err(DeltaBackendError::PermissionDenied("unrecognized Delta action".into())),
        }
    }
}
```

It's the same crate and the same routes, serving the same Delta wire protocol.
The two hosts identify callers differently and make different decisions, and
neither one forked the API to do it. The integration is still in progress: the
Lakekeeper side lives on a branch and covers the read path today. But we didn't
have to change the shape of the crate to make it work, because the crate never
assumed whose server it was in.

<!-- Seams to state or close before publish (see brief §9): Connect handlers get
     connectrpc::RequestContext, not Cx; mangrove's Delta adapter still leaves some
     authorize arms to downstream handlers; Lakekeeper pins delta-api 0.0.5.
     Pin every code link to 1af79ee (trestle) / 193a899e (mangrove) / c2d026fb (lakekeeper). -->

## The client and the screen for free

*Stub:* the typed client and the React check-in screen.

## Carving a resource onto its own table

*Stub:* the generic `Object<L>` store first, then a hand-written `Label`-routed
backend and its migrations sharing the store's ledger.

## Opinionated by default: sensitive data at rest

*Stub:* envelope encryption for `FieldRole::Sensitive` fields (pending merge).

## Where the generator earns its keep

*Stub:* the payoff, the honest seams, and when to reach for it.
