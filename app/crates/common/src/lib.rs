//! Shared types for the docs-factory-app app.
//!
//! The `models::_gen` module is produced by `trestle generate` from
//! `proto/docs_factory_app/v1/*.proto` (run `just regen` to refresh). The
//! hand-written `error`, `models::object`, `models::resources`, and
//! `models::association` modules provide the glue the generated `labels.rs`
//! expects (the resource registry, `Object` interchange type, and association
//! vocabulary) so resources plug into `olai-store`.

pub use error::{Error, Result};

pub mod error;
pub mod models;
