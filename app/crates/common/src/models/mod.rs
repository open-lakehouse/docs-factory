//! Model types for docs-factory-app.
//!
//! `_gen` is produced by `trestle generate` (configured in `trestle.yaml`); run
//! `just regen` to refresh. The hand-written sibling modules supply the glue the
//! generated `_gen/labels.rs` references: the `Object` interchange alias, the
//! `Resource*` registry types + `ResourceExt` trait, and the association
//! vocabulary.

// The buffa-generated models occasionally emit `match` arms clippy would
// collapse; they're machine-generated and not ours to edit, so silence the lint
// for the generated module rather than crate-wide.
#[allow(clippy::match_single_binding)]
#[path = "_gen/mod.rs"]
mod _gen;
pub use _gen::*;

// The generated `_gen/mod.rs` strips the package root, exposing the models at
// `models::tracker::v1` (matching the labels.rs `super::tracker::v1` paths). The
// ConnectRPC facade (`protoc-gen-connect-rust`) instead references the FULL
// package path `models::docs_factory::tracker::v1`. Alias the root segment so
// both spellings resolve to the same generated module.
pub mod docs_factory {
    pub use super::_gen::tracker;
}

// Re-export the store registry from the generated `labels` module so callers use
// the stable `models::RESOURCE_DESCRIPTORS` path.
pub use _gen::labels::RESOURCE_DESCRIPTORS;

pub mod association;
pub mod object;
pub mod resources;

pub use association::AssociationLabel;
pub use object::Object;
pub use resources::{ResourceExt, ResourceIdent, ResourceName, ResourceRef};
