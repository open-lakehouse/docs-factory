//! Hand-written handler implementations.
//!
//! `core` holds the protocol-agnostic graph logic (CRUD over a
//! `ManagedObjectStore` + association edges). `service` implements every
//! generated REST handler trait on one `Service`; `service_connect` implements
//! the matching ConnectRPC service traits on the same `Service`. Both transports
//! delegate to the one shared `Core`.

pub mod core;
pub mod service;
pub mod service_connect;
