//! Protocol-agnostic CRUD + association core, shared by every resource handler.
//!
//! Resources are stored as `olai-store` `Object`s through a `ManagedObjectStore`,
//! which enforces the field roles from `RESOURCE_DESCRIPTORS` (identifier and
//! managed fields are stripped on write and re-injected on read). Handlers stay
//! thin: serialize the typed resource to JSON properties, call the core, and map
//! the stored `Object` back to the typed resource.

use std::sync::Arc;

use docs_factory_app_common::models::{Object, ObjectLabel, ResourceName};
use olai_store::{
    AssociationStore, AssociationStoreReader, ManagedObjectStore, ObjectStore, ObjectStoreReader,
    ResourceRegistry,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::api::Error;
use crate::store::MemStore;

/// Backing store: the in-memory graph (shared via `Arc`) wrapped in field-role
/// enforcement. `ObjectStore` is blanket-impl'd for `Arc<T>`, so the managed
/// wrapper and the raw association path share one `MemStore`.
type Managed = ManagedObjectStore<ObjectLabel, Arc<MemStore>>;

/// Shared, cloneable application core. Every per-service handler holds a clone
/// and they all see the same graph.
#[derive(Clone)]
pub struct Core {
    managed: Arc<Managed>,
    raw: Arc<MemStore>,
}

impl Default for Core {
    fn default() -> Self {
        Self::new()
    }
}

impl Core {
    pub fn new() -> Self {
        let raw = Arc::new(MemStore::new());
        let registry =
            ResourceRegistry::from_static(docs_factory_app_common::models::RESOURCE_DESCRIPTORS);
        let managed = Arc::new(ManagedObjectStore::new(Arc::clone(&raw), registry));
        Self { managed, raw }
    }

    /// Create a resource. `props` is the resource serialized to JSON; the
    /// server assigns a UUID that becomes both the object id and resource name.
    pub async fn create<R>(&self, label: ObjectLabel, props: serde_json::Value) -> Result<R, Error>
    where
        R: DeserializeOwned,
    {
        let id = Uuid::new_v4();
        let name = ResourceName::new([id.hyphenated().to_string()]);
        let object = self
            .managed
            .create(label, &name, Some(props), Some(id))
            .await?;
        object_to_resource(object)
    }

    /// Fetch a resource by its `{plural}/{uuid}` (or bare `{uuid}`) name.
    pub async fn get<R>(&self, name: &str) -> Result<R, Error>
    where
        R: DeserializeOwned,
    {
        let id = parse_id(name)?;
        let object = self.managed.get(&id).await?;
        object_to_resource(object)
    }

    /// List resources of a label, returning `(items, next_page_token)`.
    pub async fn list<R>(
        &self,
        label: ObjectLabel,
        max_results: Option<usize>,
        page_token: Option<String>,
    ) -> Result<(Vec<R>, Option<String>), Error>
    where
        R: DeserializeOwned,
    {
        let (objects, next) = self
            .managed
            .list(label, None, max_results, page_token)
            .await?;
        let items = objects
            .into_iter()
            .map(object_to_resource)
            .collect::<Result<Vec<R>, Error>>()?;
        Ok((items, next))
    }

    /// Replace a resource's properties.
    pub async fn update<R>(&self, name: &str, props: serde_json::Value) -> Result<R, Error>
    where
        R: DeserializeOwned,
    {
        let id = parse_id(name)?;
        let object = self.managed.update(&id, Some(props)).await?;
        object_to_resource(object)
    }

    /// Delete a resource and its edges.
    pub async fn delete(&self, name: &str) -> Result<(), Error> {
        let id = parse_id(name)?;
        self.managed.delete(&id).await?;
        Ok(())
    }

    /// Add a directed edge `from --label--> to` (resource names), maintaining
    /// the inverse edge. Operates on raw object ids, below the managed layer.
    pub async fn add_association(&self, from: &str, to: &str, label: &str) -> Result<(), Error> {
        let from_id = parse_id(from)?;
        let to_id = parse_id(to)?;
        self.raw.add(from_id, to_id, label, None).await?;
        Ok(())
    }

    pub async fn remove_association(&self, from: &str, to: &str, label: &str) -> Result<(), Error> {
        let from_id = parse_id(from)?;
        let to_id = parse_id(to)?;
        self.raw.remove(from_id, to_id, label).await?;
        Ok(())
    }

    /// List edges out of `from`, optionally filtered by label. Returns
    /// `(from_id, label, to_id)` name triples plus the next page token.
    pub async fn list_associations(
        &self,
        from: &str,
        label: Option<&str>,
        max_results: Option<usize>,
        page_token: Option<String>,
    ) -> Result<(Vec<(String, String, String)>, Option<String>), Error> {
        let from_id = parse_id(from)?;
        let (edges, next) = AssociationStoreReader::list(
            &self.raw,
            from_id,
            label.unwrap_or(""),
            None,
            max_results,
            page_token,
        )
        .await?;
        let triples = edges
            .into_iter()
            .map(|e| {
                (
                    e.from_id.hyphenated().to_string(),
                    e.label,
                    e.to_id.hyphenated().to_string(),
                )
            })
            .collect();
        Ok((triples, next))
    }
}

/// Parse the trailing UUID out of a `{plural}/{uuid}` (or bare `{uuid}`) name.
fn parse_id(name: &str) -> Result<Uuid, Error> {
    let last = name.rsplit('/').next().unwrap_or(name);
    Uuid::parse_str(last).map_err(|_| Error::BadRequest(format!("invalid resource name: {name}")))
}

/// Deserialize a stored `Object`'s properties into the typed resource, stamping
/// the resource `name` from the object id.
fn object_to_resource<R: DeserializeOwned>(object: Object) -> Result<R, Error> {
    let mut props = object
        .properties
        .unwrap_or_else(|| serde_json::Value::Object(Default::default()));
    if let serde_json::Value::Object(map) = &mut props {
        map.insert(
            "name".to_string(),
            serde_json::Value::String(object.id.hyphenated().to_string()),
        );
    }
    serde_json::from_value(props).map_err(|e| Error::Internal(e.to_string()))
}

/// Serialize a typed resource to JSON properties for storage.
pub fn resource_to_props<R: Serialize>(resource: &R) -> Result<serde_json::Value, Error> {
    serde_json::to_value(resource).map_err(|e| Error::Internal(e.to_string()))
}
