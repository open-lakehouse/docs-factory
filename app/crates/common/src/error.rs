//! Error type shared across the common models.
//!
//! The generated `_gen/labels.rs` references `crate::Error` (via `Error::generic`
//! and `From<serde_json::Error>`) for the `Object`<->resource conversions.

/// Convenience `Result` alias for the common crate.
pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Entity not found.")]
    NotFound,

    #[error("Already exists")]
    AlreadyExists,

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Invalid identifier: {0}")]
    InvalidIdentifier(#[from] uuid::Error),

    #[error("Generic error: {0}")]
    Generic(String),

    #[error(transparent)]
    SerDe(#[from] serde_json::Error),

    #[error(transparent)]
    ResourceStore(#[from] olai_store::Error),
}

impl Error {
    pub fn generic(msg: impl Into<String>) -> Self {
        Self::Generic(msg.into())
    }

    pub fn invalid_argument(msg: impl Into<String>) -> Self {
        Self::InvalidArgument(msg.into())
    }
}
