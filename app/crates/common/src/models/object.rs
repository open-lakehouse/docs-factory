//! The `Object` interchange type and its resource conversions.
//!
//! `Object` is `olai_store::Object<ObjectLabel>` — the untyped graph node the
//! store persists. The generated `_gen/labels.rs` provides the per-resource
//! `Object <-> ResourceX` conversions and `ResourceExt for ResourceX`; here we
//! add the `ResourceExt for Object` impl it relies on and the aggregate
//! `Resource <-> Object` conversions for handler convenience.

use crate::Error;
use crate::models::{ObjectLabel, Resource, ResourceExt, ResourceIdent, ResourceName, ResourceRef};

/// Alias for `olai_store::Object` parameterized with our generated `ObjectLabel`.
pub type Object = olai_store::Object<ObjectLabel>;

impl ResourceExt for Object {
    fn resource_name(&self) -> ResourceName {
        self.name.clone()
    }

    fn resource_ref(&self) -> ResourceRef {
        ResourceRef::Uuid(self.id)
    }

    fn resource_ident(&self) -> ResourceIdent {
        self.label.to_ident(self.id)
    }
}

impl ResourceExt for Resource {
    fn resource_name(&self) -> ResourceName {
        match self {
            Resource::Artifact(o) => o.resource_name(),
            Resource::Project(o) => o.resource_name(),
            Resource::Release(o) => o.resource_name(),
            Resource::Repository(o) => o.resource_name(),
            Resource::Task(o) => o.resource_name(),
            Resource::Website(o) => o.resource_name(),
        }
    }

    fn resource_ref(&self) -> ResourceRef {
        match self {
            Resource::Artifact(o) => o.resource_ref(),
            Resource::Project(o) => o.resource_ref(),
            Resource::Release(o) => o.resource_ref(),
            Resource::Repository(o) => o.resource_ref(),
            Resource::Task(o) => o.resource_ref(),
            Resource::Website(o) => o.resource_ref(),
        }
    }

    fn resource_ident(&self) -> ResourceIdent {
        match self {
            Resource::Artifact(o) => o.resource_ident(),
            Resource::Project(o) => o.resource_ident(),
            Resource::Release(o) => o.resource_ident(),
            Resource::Repository(o) => o.resource_ident(),
            Resource::Task(o) => o.resource_ident(),
            Resource::Website(o) => o.resource_ident(),
        }
    }
}

impl TryFrom<Resource> for Object {
    type Error = Error;

    fn try_from(resource: Resource) -> Result<Self, Self::Error> {
        match resource {
            Resource::Artifact(o) => o.try_into(),
            Resource::Project(o) => o.try_into(),
            Resource::Release(o) => o.try_into(),
            Resource::Repository(o) => o.try_into(),
            Resource::Task(o) => o.try_into(),
            Resource::Website(o) => o.try_into(),
        }
    }
}

impl TryFrom<Object> for Resource {
    type Error = Error;

    fn try_from(obj: Object) -> Result<Self, Self::Error> {
        match obj.label {
            ObjectLabel::Artifact => Ok(Resource::Artifact(obj.try_into()?)),
            ObjectLabel::Project => Ok(Resource::Project(obj.try_into()?)),
            ObjectLabel::Release => Ok(Resource::Release(obj.try_into()?)),
            ObjectLabel::Repository => Ok(Resource::Repository(obj.try_into()?)),
            ObjectLabel::Task => Ok(Resource::Task(obj.try_into()?)),
            ObjectLabel::Website => Ok(Resource::Website(obj.try_into()?)),
        }
    }
}
