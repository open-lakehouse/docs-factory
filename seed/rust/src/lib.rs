//! Deterministic Delta-table seeder for docs-factory Rust examples.
//!
//! Mirrors the Python [`docs_factory_seed`] package: it builds the same logical
//! dataset (described in `seed/datasets/<name>/dataset.yaml`) so a delta-rs
//! example that reads seeded data has history to read.
//!
//! **Status: stub.** The signature is fixed so example code can already call it;
//! the body is wired up when the Rust examples are built out (it will read the
//! shared `dataset.yaml` spec and write a multi-version Delta table via delta-rs).

use std::path::PathBuf;

/// Materialize the named dataset and return the path to the Delta table root.
///
/// # Errors
/// Returns an error once implemented if the dataset is unknown or the table
/// cannot be written.
pub fn seed_dataset(_name: &str) -> Result<PathBuf, SeedError> {
    Err(SeedError::NotImplemented)
}

/// Errors returned by [`seed_dataset`].
#[derive(Debug)]
pub enum SeedError {
    /// The Rust seeder is not implemented yet (scaffold stub).
    NotImplemented,
}

impl std::fmt::Display for SeedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SeedError::NotImplemented => {
                write!(f, "docs-factory-seed (rust) is not implemented yet")
            }
        }
    }
}

impl std::error::Error for SeedError {}
