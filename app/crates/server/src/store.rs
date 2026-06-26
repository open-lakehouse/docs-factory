//! In-memory implementation of the `olai-store` traits.
//!
//! Backs the first usable slice so we can run the tracker and enter releases
//! without standing up Postgres. It is process-local and non-durable — the
//! follow-up is to adapt mangrove's `crates/postgres` `Store` (swap in our
//! `ObjectLabel`/`AssociationLabel` ENUMs, drop the envelope encryptor) behind
//! the same traits, leaving handlers untouched.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;

use async_trait::async_trait;
use docs_factory_app_common::models::{AssociationLabel, ObjectLabel};
use olai_store::{
    Association, AssociationStore, AssociationStoreReader, Error, Object, ObjectStore,
    ObjectStoreReader, ResourceName, Result,
};
use uuid::Uuid;

type Obj = Object<ObjectLabel>;
type Assoc = Association<ObjectLabel>;

/// Process-local graph store guarded by a single mutex. Cloneable via `Arc` in
/// `main.rs`; the lock is held only for the duration of each operation.
#[derive(Default)]
pub struct MemStore {
    objects: Mutex<HashMap<Uuid, Obj>>,
    // Edges in insertion order; inverse edges are stored alongside the primary.
    associations: Mutex<Vec<Assoc>>,
}

impl MemStore {
    pub fn new() -> Self {
        Self::default()
    }

    fn now() -> chrono::DateTime<chrono::Utc> {
        chrono::Utc::now()
    }
}

#[async_trait]
impl ObjectStoreReader<ObjectLabel> for MemStore {
    async fn get(&self, id: &Uuid) -> Result<Obj> {
        self.objects
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or(Error::NotFound)
    }

    async fn get_by_name(&self, label: ObjectLabel, name: &ResourceName) -> Result<Obj> {
        self.objects
            .lock()
            .unwrap()
            .values()
            .find(|o| o.label == label && &o.name == name)
            .cloned()
            .ok_or(Error::NotFound)
    }

    async fn list(
        &self,
        label: ObjectLabel,
        namespace: Option<&ResourceName>,
        max_results: Option<usize>,
        page_token: Option<String>,
    ) -> Result<(Vec<Obj>, Option<String>)> {
        let mut items: Vec<Obj> = self
            .objects
            .lock()
            .unwrap()
            .values()
            .filter(|o| o.label == label)
            .filter(|o| match namespace {
                Some(ns) => o.name.to_string().starts_with(&ns.to_string()),
                None => true,
            })
            .cloned()
            .collect();
        // Stable order so paging is deterministic.
        items.sort_by_key(|o| o.id);
        paginate(items, max_results, page_token)
    }
}

#[async_trait]
impl ObjectStore<ObjectLabel> for MemStore {
    async fn create(
        &self,
        label: ObjectLabel,
        name: &ResourceName,
        properties: Option<serde_json::Value>,
        id: Option<Uuid>,
    ) -> Result<Obj> {
        let mut objects = self.objects.lock().unwrap();
        let id = id.unwrap_or_else(Uuid::new_v4);
        if objects.contains_key(&id) {
            return Err(Error::AlreadyExists);
        }
        if objects
            .values()
            .any(|o| o.label == label && &o.name == name)
        {
            return Err(Error::AlreadyExists);
        }
        let obj = Object {
            id,
            label,
            name: name.clone(),
            properties,
            created_at: Self::now(),
            updated_at: None,
        };
        objects.insert(id, obj.clone());
        Ok(obj)
    }

    async fn update(&self, id: &Uuid, properties: Option<serde_json::Value>) -> Result<Obj> {
        let mut objects = self.objects.lock().unwrap();
        let obj = objects.get_mut(id).ok_or(Error::NotFound)?;
        obj.properties = properties;
        obj.updated_at = Some(Self::now());
        Ok(obj.clone())
    }

    async fn delete(&self, id: &Uuid) -> Result<()> {
        let mut objects = self.objects.lock().unwrap();
        if objects.remove(id).is_none() {
            return Err(Error::NotFound);
        }
        // Drop every edge touching this object (both directions).
        self.associations
            .lock()
            .unwrap()
            .retain(|a| &a.from_id != id && &a.to_id != id);
        Ok(())
    }
}

#[async_trait]
impl AssociationStoreReader<ObjectLabel> for MemStore {
    async fn list(
        &self,
        from_id: Uuid,
        label: &str,
        target_label: Option<ObjectLabel>,
        max_results: Option<usize>,
        page_token: Option<String>,
    ) -> Result<(Vec<Assoc>, Option<String>)> {
        // An empty `label` means "no edge-label filter" — return every outgoing
        // edge from `from_id`.
        let mut items: Vec<Assoc> = self
            .associations
            .lock()
            .unwrap()
            .iter()
            .filter(|a| a.from_id == from_id && (label.is_empty() || a.label == label))
            .filter(|a| target_label.is_none_or(|t| a.to_label == t))
            .cloned()
            .collect();
        items.sort_by_key(|a| a.id);
        paginate(items, max_results, page_token)
    }
}

#[async_trait]
impl AssociationStore<ObjectLabel> for MemStore {
    async fn add(
        &self,
        from_id: Uuid,
        to_id: Uuid,
        label: &str,
        properties: Option<serde_json::Value>,
    ) -> Result<()> {
        // Both endpoints must exist.
        {
            let objects = self.objects.lock().unwrap();
            let from = objects.get(&from_id).ok_or(Error::NotFound)?;
            let to = objects.get(&to_id).ok_or(Error::NotFound)?;
            let (from_label, to_label) = (from.label, to.label);

            let mut assocs = self.associations.lock().unwrap();
            if assocs
                .iter()
                .any(|a| a.from_id == from_id && a.to_id == to_id && a.label == label)
            {
                return Err(Error::AlreadyExists);
            }
            let now = Self::now();
            assocs.push(Association {
                id: Uuid::new_v4(),
                from_id,
                label: label.to_string(),
                to_id,
                to_label,
                properties: properties.clone(),
                created_at: now,
                updated_at: None,
            });
            // Maintain the inverse edge when the label has one.
            if let Some(inverse) = parse_label(label).and_then(|l| l.inverse()) {
                assocs.push(Association {
                    id: Uuid::new_v4(),
                    from_id: to_id,
                    label: inverse.as_ref().to_string(),
                    to_id: from_id,
                    to_label: from_label,
                    properties,
                    created_at: now,
                    updated_at: None,
                });
            }
        }
        Ok(())
    }

    async fn remove(&self, from_id: Uuid, to_id: Uuid, label: &str) -> Result<()> {
        let inverse = parse_label(label).and_then(|l| l.inverse());
        let mut assocs = self.associations.lock().unwrap();
        let before = assocs.len();
        assocs.retain(|a| {
            let primary = a.from_id == from_id && a.to_id == to_id && a.label == label;
            let inverse_edge = match &inverse {
                Some(inv) => a.from_id == to_id && a.to_id == from_id && a.label == inv.as_ref(),
                None => false,
            };
            !(primary || inverse_edge)
        });
        if assocs.len() == before {
            return Err(Error::NotFound);
        }
        Ok(())
    }
}

/// Parse an edge label string into the typed vocabulary; unknown labels have no
/// inverse and are stored verbatim.
fn parse_label(label: &str) -> Option<AssociationLabel> {
    AssociationLabel::from_str(label).ok()
}

/// Slice `items` by an offset encoded in `page_token` and return the next token.
fn paginate<T>(
    items: Vec<T>,
    max_results: Option<usize>,
    page_token: Option<String>,
) -> Result<(Vec<T>, Option<String>)> {
    let start: usize = match page_token {
        Some(t) => t
            .parse()
            .map_err(|_| Error::invalid_argument("invalid page_token"))?,
        None => 0,
    };
    let limit = max_results.unwrap_or(usize::MAX).max(1);
    let end = start.saturating_add(limit).min(items.len());
    let next = if end < items.len() {
        Some(end.to_string())
    } else {
        None
    };
    let page = items.into_iter().skip(start).take(end - start).collect();
    Ok((page, next))
}
