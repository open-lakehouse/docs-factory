//! Resource identity helpers used by the generated `_gen/labels.rs`.
//!
//! `ResourceName`/`ResourceRef` come straight from `olai-store`. `ResourceIdent`
//! is a typed (label, ref) pair, `ResourceExt` is the trait the generated
//! per-resource impls satisfy, and `ObjectLabel::to_ident` maps a label + ref to
//! a `ResourceIdent`.

pub use olai_store::{ResourceName, ResourceRef};

use crate::models::ObjectLabel;

/// A resource identified by its type label and a reference (UUID or name).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ResourceIdent {
    Artifact(ResourceRef),
    Project(ResourceRef),
    Release(ResourceRef),
    Repository(ResourceRef),
    Task(ResourceRef),
    Website(ResourceRef),
}

impl ResourceIdent {
    pub fn label(&self) -> ObjectLabel {
        match self {
            ResourceIdent::Artifact(_) => ObjectLabel::Artifact,
            ResourceIdent::Project(_) => ObjectLabel::Project,
            ResourceIdent::Release(_) => ObjectLabel::Release,
            ResourceIdent::Repository(_) => ObjectLabel::Repository,
            ResourceIdent::Task(_) => ObjectLabel::Task,
            ResourceIdent::Website(_) => ObjectLabel::Website,
        }
    }

    pub fn reference(&self) -> &ResourceRef {
        match self {
            ResourceIdent::Artifact(r)
            | ResourceIdent::Project(r)
            | ResourceIdent::Release(r)
            | ResourceIdent::Repository(r)
            | ResourceIdent::Task(r)
            | ResourceIdent::Website(r) => r,
        }
    }
}

impl std::fmt::Display for ResourceIdent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.label().as_ref(), self.reference())
    }
}

impl From<ResourceIdent> for ResourceRef {
    fn from(ident: ResourceIdent) -> Self {
        match ident {
            ResourceIdent::Artifact(r)
            | ResourceIdent::Project(r)
            | ResourceIdent::Release(r)
            | ResourceIdent::Repository(r)
            | ResourceIdent::Task(r)
            | ResourceIdent::Website(r) => r,
        }
    }
}

/// Common accessors implemented (by the generated `labels.rs`) for every
/// resource type and for `Object`/`Resource`.
pub trait ResourceExt {
    /// The resource's hierarchical name.
    fn resource_name(&self) -> ResourceName;

    /// A reference to the resource — a UUID where available, else its name.
    fn resource_ref(&self) -> ResourceRef;

    /// The typed (label, ref) identity of the resource.
    fn resource_ident(&self) -> ResourceIdent;
}

impl<T: ResourceExt> From<&T> for ResourceIdent {
    fn from(resource: &T) -> Self {
        resource.resource_ident()
    }
}

impl ObjectLabel {
    /// Build a [`ResourceIdent`] for this label from a reference.
    pub fn to_ident(&self, id: impl Into<ResourceRef>) -> ResourceIdent {
        let r = id.into();
        match self {
            ObjectLabel::Artifact => ResourceIdent::Artifact(r),
            ObjectLabel::Project => ResourceIdent::Project(r),
            ObjectLabel::Release => ResourceIdent::Release(r),
            ObjectLabel::Repository => ResourceIdent::Repository(r),
            ObjectLabel::Task => ResourceIdent::Task(r),
            ObjectLabel::Website => ResourceIdent::Website(r),
        }
    }
}
