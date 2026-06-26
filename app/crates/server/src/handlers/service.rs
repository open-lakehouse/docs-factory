//! REST handler implementations for every resource + the association service.
//!
//! All seven generated handler traits are implemented on one [`Service`] struct,
//! each delegating to the shared [`Core`]. The six CRUD resources are identical
//! in shape, so a macro generates their impls; the association service is
//! hand-written because its requests carry `(from, to, label)` triples rather
//! than a resource body.

use async_trait::async_trait;
use docs_factory_app_common::models::ObjectLabel;
use docs_factory_app_common::models::tracker::v1::*;

use crate::api::{Error, RequestContext, Result};
use crate::codegen::artifact::ArtifactHandler;
use crate::codegen::association::AssociationHandler;
use crate::codegen::project::ProjectHandler;
use crate::codegen::release::ReleaseHandler;
use crate::codegen::repository::RepositoryHandler;
use crate::codegen::task::TaskHandler;
use crate::codegen::website::WebsiteHandler;
use crate::handlers::core::{Core, resource_to_props};

/// REST-facing service over the shared graph core.
#[derive(Default, Clone)]
pub struct Service {
    core: Core,
}

impl Service {
    pub fn new() -> Self {
        Self::default()
    }

    /// Expose the shared core so `main.rs` can hand the same instance to the
    /// Connect adapters (so REST and Connect see one graph).
    pub fn core(&self) -> Core {
        self.core.clone()
    }
}

/// Generate the five CRUD methods of a resource's `*Handler` trait, all
/// delegating to `Core`. `$body` is the request field holding the resource on
/// create/update (e.g. `project`).
macro_rules! crud_handler {
    (
        $handler:ident, $label:expr, $res:ty, $body:ident,
        create = $create_req:ty,
        get = $get_req:ty,
        list = $list_req:ty => $list_resp:ty | $list_field:ident,
        update = $update_req:ty,
        delete = $delete_req:ty => $delete_resp:ty,
        $create_fn:ident, $get_fn:ident, $list_fn:ident, $update_fn:ident, $delete_fn:ident
    ) => {
        #[async_trait]
        impl $handler for Service {
            async fn $create_fn(&self, request: $create_req, _ctx: RequestContext) -> Result<$res> {
                let body = request.$body.into_option().ok_or_else(|| {
                    Error::BadRequest(concat!(stringify!($body), " is required").into())
                })?;
                let props = resource_to_props(&body)?;
                self.core.create($label, props).await
            }

            async fn $get_fn(&self, request: $get_req, _ctx: RequestContext) -> Result<$res> {
                self.core.get(&request.name).await
            }

            async fn $list_fn(
                &self,
                request: $list_req,
                _ctx: RequestContext,
            ) -> Result<$list_resp> {
                let max = request.max_results.filter(|n| *n > 0).map(|n| n as usize);
                let token = request.page_token.filter(|t| !t.is_empty());
                let (items, next) = self.core.list($label, max, token).await?;
                let mut resp = <$list_resp as ::core::default::Default>::default();
                resp.$list_field = items;
                resp.next_page_token = next;
                Ok(resp)
            }

            async fn $update_fn(&self, request: $update_req, _ctx: RequestContext) -> Result<$res> {
                let body = request.$body.into_option().ok_or_else(|| {
                    Error::BadRequest(concat!(stringify!($body), " is required").into())
                })?;
                let name = body.name.clone();
                let props = resource_to_props(&body)?;
                self.core.update(&name, props).await
            }

            async fn $delete_fn(
                &self,
                request: $delete_req,
                _ctx: RequestContext,
            ) -> Result<$delete_resp> {
                self.core.delete(&request.name).await?;
                Ok(<$delete_resp as ::core::default::Default>::default())
            }
        }
    };
}

crud_handler!(
    ProjectHandler, ObjectLabel::Project, Project, project,
    create = CreateProjectRequest,
    get = GetProjectRequest,
    list = ListProjectsRequest => ListProjectsResponse | projects,
    update = UpdateProjectRequest,
    delete = DeleteProjectRequest => DeleteProjectResponse,
    create_project, get_project, list_projects, update_project, delete_project
);

crud_handler!(
    RepositoryHandler, ObjectLabel::Repository, Repository, repository,
    create = CreateRepositoryRequest,
    get = GetRepositoryRequest,
    list = ListRepositoriesRequest => ListRepositoriesResponse | repositories,
    update = UpdateRepositoryRequest,
    delete = DeleteRepositoryRequest => DeleteRepositoryResponse,
    create_repository, get_repository, list_repositories, update_repository, delete_repository
);

crud_handler!(
    WebsiteHandler, ObjectLabel::Website, Website, website,
    create = CreateWebsiteRequest,
    get = GetWebsiteRequest,
    list = ListWebsitesRequest => ListWebsitesResponse | websites,
    update = UpdateWebsiteRequest,
    delete = DeleteWebsiteRequest => DeleteWebsiteResponse,
    create_website, get_website, list_websites, update_website, delete_website
);

crud_handler!(
    ReleaseHandler, ObjectLabel::Release, Release, release,
    create = CreateReleaseRequest,
    get = GetReleaseRequest,
    list = ListReleasesRequest => ListReleasesResponse | releases,
    update = UpdateReleaseRequest,
    delete = DeleteReleaseRequest => DeleteReleaseResponse,
    create_release, get_release, list_releases, update_release, delete_release
);

crud_handler!(
    ArtifactHandler, ObjectLabel::Artifact, Artifact, artifact,
    create = CreateArtifactRequest,
    get = GetArtifactRequest,
    list = ListArtifactsRequest => ListArtifactsResponse | artifacts,
    update = UpdateArtifactRequest,
    delete = DeleteArtifactRequest => DeleteArtifactResponse,
    create_artifact, get_artifact, list_artifacts, update_artifact, delete_artifact
);

crud_handler!(
    TaskHandler, ObjectLabel::Task, Task, task,
    create = CreateTaskRequest,
    get = GetTaskRequest,
    list = ListTasksRequest => ListTasksResponse | tasks,
    update = UpdateTaskRequest,
    delete = DeleteTaskRequest => DeleteTaskResponse,
    create_task, get_task, list_tasks, update_task, delete_task
);

#[async_trait]
impl AssociationHandler for Service {
    async fn add_association(
        &self,
        request: AddAssociationRequest,
        _ctx: RequestContext,
    ) -> Result<AddAssociationResponse> {
        self.core
            .add_association(&request.from, &request.to, &request.label)
            .await?;
        Ok(AddAssociationResponse::default())
    }

    async fn remove_association(
        &self,
        request: RemoveAssociationRequest,
        _ctx: RequestContext,
    ) -> Result<RemoveAssociationResponse> {
        self.core
            .remove_association(&request.from, &request.to, &request.label)
            .await?;
        Ok(RemoveAssociationResponse::default())
    }

    async fn list_associations(
        &self,
        request: ListAssociationsRequest,
        _ctx: RequestContext,
    ) -> Result<ListAssociationsResponse> {
        let label = request.label.filter(|l| !l.is_empty());
        let max = request.max_results.filter(|n| *n > 0).map(|n| n as usize);
        let token = request.page_token.filter(|t| !t.is_empty());
        let (triples, next) = self
            .core
            .list_associations(&request.from, label.as_deref(), max, token)
            .await?;
        let associations = triples
            .into_iter()
            .map(|(from, label, to)| Association {
                from,
                label,
                to,
                ..Default::default()
            })
            .collect();
        Ok(ListAssociationsResponse {
            associations,
            next_page_token: next,
            ..Default::default()
        })
    }
}
