//! docs-factory-app server entry point.
//!
//! Databricks Apps runs this binary in a container and routes traffic to the
//! port it sets via the `DATABRICKS_APP_PORT` env var (defaulting to 8080).
//! Headers like `X-Forwarded-Access-Token` carry the end-user's OBO credential.
//!
//! One `Service` (shared `Core` over the in-memory graph store) backs every
//! resource: its REST routes are mounted explicitly below, and the same
//! instance is registered with the ConnectRPC router so both transports see one
//! graph.

use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::routing::{get, post};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

mod api;
// `gen` is a reserved keyword in Rust 2024, so the generated `gen/` directory is
// mounted under the `codegen` alias (matching the client crate).
#[path = "gen/mod.rs"]
mod codegen;
// Generated ConnectRPC service facade (buffa views + connectrpc traits).
#[path = "connect_gen/mod.rs"]
mod connect_gen;
mod handlers;
mod store;

use api::RequestContext as Cx;
use handlers::service::Service;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_logging();

    let port: u16 = env::var("DATABRICKS_APP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();

    let app = build_router();

    tracing::info!(%addr, "docs-factory-app server listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// Add one resource's five CRUD routes to `router` (a `Router<Service>`, state
/// applied once at the end). Collection paths (`/v1/{plural}`) carry
/// create/list; item paths (`/v1/{plural}/{name}`) carry get/update/delete.
macro_rules! resource_routes {
    ($router:expr, $plural:literal, $module:ident,
     $create:ident, $get:ident, $list:ident, $update:ident, $delete:ident) => {{
        use crate::codegen::$module::server::*;
        $router
            .route(
                concat!("/v1/", $plural),
                post($create::<Service, Cx>).get($list::<Service, Cx>),
            )
            .route(
                concat!("/v1/", $plural, "/{name}"),
                get($get::<Service, Cx>)
                    .patch($update::<Service, Cx>)
                    .delete($delete::<Service, Cx>),
            )
    }};
}

fn build_router() -> Router {
    let svc = Service::new();

    // Accumulate every resource's routes into one `Router<Service>`, then apply
    // the shared state once.
    let mut rest = axum::Router::<Service>::new();
    rest = resource_routes!(
        rest,
        "projects",
        project,
        create_project,
        get_project,
        list_projects,
        update_project,
        delete_project
    );
    rest = resource_routes!(
        rest,
        "repositories",
        repository,
        create_repository,
        get_repository,
        list_repositories,
        update_repository,
        delete_repository
    );
    rest = resource_routes!(
        rest,
        "websites",
        website,
        create_website,
        get_website,
        list_websites,
        update_website,
        delete_website
    );
    rest = resource_routes!(
        rest,
        "releases",
        release,
        create_release,
        get_release,
        list_releases,
        update_release,
        delete_release
    );
    rest = resource_routes!(
        rest,
        "artifacts",
        artifact,
        create_artifact,
        get_artifact,
        list_artifacts,
        update_artifact,
        delete_artifact
    );
    rest = resource_routes!(
        rest,
        "tasks",
        task,
        create_task,
        get_task,
        list_tasks,
        update_task,
        delete_task
    );

    // Associations: add/list on the collection, remove via the `:remove` verb.
    {
        use crate::codegen::association::server::*;
        rest = rest
            .route(
                "/v1/associations",
                post(add_association::<Service, Cx>).get(list_associations::<Service, Cx>),
            )
            .route(
                "/v1/associations:remove",
                post(remove_association::<Service, Cx>),
            );
    }
    let rest = rest.with_state(svc.clone());

    // Register every Connect service on one router against the same `Service`.
    let connect_router = register_connect(Arc::new(svc));

    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .merge(rest)
        // REST routes are explicit; the Connect RPC paths fall through here.
        .fallback_service(connect_router.into_axum_service())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

/// Register all seven generated ConnectRPC services on one router.
fn register_connect(svc: Arc<Service>) -> connectrpc::Router {
    use crate::connect_gen::docs_factory::tracker::v1::{
        ArtifactServiceExt, AssociationServiceExt, ProjectServiceExt, ReleaseServiceExt,
        RepositoryServiceExt, TaskServiceExt, WebsiteServiceExt,
    };
    let router = connectrpc::Router::new();
    let router = ProjectServiceExt::register(Arc::clone(&svc), router);
    let router = RepositoryServiceExt::register(Arc::clone(&svc), router);
    let router = WebsiteServiceExt::register(Arc::clone(&svc), router);
    let router = ReleaseServiceExt::register(Arc::clone(&svc), router);
    let router = ArtifactServiceExt::register(Arc::clone(&svc), router);
    let router = TaskServiceExt::register(Arc::clone(&svc), router);
    AssociationServiceExt::register(svc, router)
}

fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_env("APP_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .init();
}
