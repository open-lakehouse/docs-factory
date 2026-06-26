//! Server-wide error type. Implements `IntoResponse` so handlers return a uniform
//! shape (HTTP status + JSON `{ "error": { "code", "message" } }`).

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

pub type Result<T> = std::result::Result<T, Error>;

// `#[allow(dead_code)]`: the starter handler only constructs a couple of these
// variants; the rest are the standard set real handlers reach for. Kept so the
// scaffold compiles under `-D warnings`.
#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum Error {
    #[error("{0}")]
    BadRequest(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Unauthorized(String),

    #[error("internal: {0}")]
    Internal(String),
}

impl Error {
    fn status(&self) -> StatusCode {
        match self {
            Error::BadRequest(_) => StatusCode::BAD_REQUEST,
            Error::NotFound(_) => StatusCode::NOT_FOUND,
            Error::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Error::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Error::BadRequest(_) => "INVALID_ARGUMENT",
            Error::NotFound(_) => "NOT_FOUND",
            Error::Unauthorized(_) => "UNAUTHENTICATED",
            Error::Internal(_) => "INTERNAL",
        }
    }
}

/// Map store-layer errors onto the HTTP error envelope.
impl From<olai_store::Error> for Error {
    fn from(e: olai_store::Error) -> Self {
        match e {
            olai_store::Error::NotFound => Error::NotFound("not found".into()),
            olai_store::Error::AlreadyExists => Error::BadRequest("already exists".into()),
            olai_store::Error::InvalidArgument(m) => Error::BadRequest(m),
            olai_store::Error::InvalidIdentifier(e) => Error::BadRequest(e.to_string()),
            olai_store::Error::Generic(m) => Error::Internal(m),
            olai_store::Error::SerDe(e) => Error::Internal(e.to_string()),
        }
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let body = json!({
            "error": {
                "code": self.code(),
                "message": self.to_string(),
            }
        });
        (self.status(), Json(body)).into_response()
    }
}
