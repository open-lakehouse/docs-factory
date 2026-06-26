//! Association (edge) label vocabulary for the resource graph.
//!
//! Copied from mangrove's `AssociationLabel` (the trestle/UC convention) so the
//! relationship semantics match across the stack. Edges are directed; most have
//! a paired inverse so the graph reads consistently in both directions.

use serde::{Deserialize, Serialize};

#[derive(
    Debug,
    Clone,
    Copy,
    Deserialize,
    Serialize,
    PartialEq,
    Hash,
    Eq,
    strum::AsRefStr,
    strum::Display,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum AssociationLabel {
    OwnedBy,
    OwnerOf,
    DependsOn,
    DependencyOf,
    ParentOf,
    ChildOf,
    HasPart,
    PartOf,
    References,
    ReferencedBy,
    /// An entity is tagged with a tag (entity -> tag).
    Tagged,
    /// A tag is applied to an entity (tag -> entity); inverse of `Tagged`.
    TaggedBy,
}

impl AssociationLabel {
    /// Get the inverse of the association label.
    ///
    /// Associations may be bidirectional, either symmetric or asymmetric.
    /// Symmetric types are their own inverse. Asymmetric types have a distinct
    /// inverse.
    pub fn inverse(&self) -> Option<Self> {
        match self {
            AssociationLabel::HasPart => Some(AssociationLabel::PartOf),
            AssociationLabel::PartOf => Some(AssociationLabel::HasPart),
            AssociationLabel::DependsOn => Some(AssociationLabel::DependencyOf),
            AssociationLabel::DependencyOf => Some(AssociationLabel::DependsOn),
            AssociationLabel::ParentOf => Some(AssociationLabel::ChildOf),
            AssociationLabel::ChildOf => Some(AssociationLabel::ParentOf),
            AssociationLabel::References => Some(AssociationLabel::ReferencedBy),
            AssociationLabel::ReferencedBy => Some(AssociationLabel::References),
            AssociationLabel::OwnedBy => Some(AssociationLabel::OwnerOf),
            AssociationLabel::OwnerOf => Some(AssociationLabel::OwnedBy),
            AssociationLabel::Tagged => Some(AssociationLabel::TaggedBy),
            AssociationLabel::TaggedBy => Some(AssociationLabel::Tagged),
        }
    }
}
