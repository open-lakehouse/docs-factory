//! ConnectRPC handler implementations for every resource + the association
//! service.
//!
//! Each generated Connect service trait is implemented on the same [`Service`]
//! the REST adapters use, delegating to the shared [`Core`] — so a create over
//! REST is visible to a get over Connect and vice-versa. Connect requests are
//! zero-copy `ServiceRequest` views; we `to_owned_message()` before any await.

use connectrpc::{ConnectError, RequestContext, Response, ServiceRequest, ServiceResult};
use docs_factory_app_common::models::ObjectLabel;
use docs_factory_app_common::models::tracker::v1::*;

use crate::api::Error;
use crate::connect_gen::docs_factory::tracker::v1::{
    ArtifactService, AssociationService, ProjectService, ReleaseService, RepositoryService,
    TaskService, WebsiteService,
};
use crate::handlers::core::resource_to_props;
use crate::handlers::service::Service;

/// Map the common API error onto the Connect error envelope.
impl From<Error> for ConnectError {
    fn from(e: Error) -> Self {
        match e {
            Error::BadRequest(m) => ConnectError::invalid_argument(m),
            Error::NotFound(m) => ConnectError::not_found(m),
            Error::Unauthorized(m) => ConnectError::unauthenticated(m),
            Error::Internal(m) => ConnectError::internal(m),
        }
    }
}

/// Generate a Connect service impl mirroring the REST CRUD shape.
macro_rules! crud_connect {
    (
        $svc:ident, $label:expr, $res:ty, $body:ident,
        create = $create_req:ty,
        get = $get_req:ty,
        list = $list_req:ty => $list_resp:ty | $list_field:ident,
        update = $update_req:ty,
        delete = $delete_req:ty => $delete_resp:ty,
        $create_fn:ident, $get_fn:ident, $list_fn:ident, $update_fn:ident, $delete_fn:ident
    ) => {
        #[allow(refining_impl_trait)]
        impl $svc for Service {
            async fn $create_fn(
                &self,
                _ctx: RequestContext,
                request: ServiceRequest<'_, $create_req>,
            ) -> ServiceResult<$res> {
                let req = request.to_owned_message();
                let body = req.$body.into_option().ok_or_else(|| {
                    ConnectError::invalid_argument(concat!(stringify!($body), " is required"))
                })?;
                let props = resource_to_props(&body)?;
                Response::ok(self.core().create($label, props).await?)
            }

            async fn $get_fn(
                &self,
                _ctx: RequestContext,
                request: ServiceRequest<'_, $get_req>,
            ) -> ServiceResult<$res> {
                let name = request.name.to_string();
                Response::ok(self.core().get(&name).await?)
            }

            async fn $list_fn(
                &self,
                _ctx: RequestContext,
                request: ServiceRequest<'_, $list_req>,
            ) -> ServiceResult<$list_resp> {
                let req = request.to_owned_message();
                let max = req.max_results.filter(|n| *n > 0).map(|n| n as usize);
                let token = req.page_token.filter(|t| !t.is_empty());
                let (items, next) = self.core().list($label, max, token).await?;
                let mut resp = <$list_resp as ::core::default::Default>::default();
                resp.$list_field = items;
                resp.next_page_token = next;
                Response::ok(resp)
            }

            async fn $update_fn(
                &self,
                _ctx: RequestContext,
                request: ServiceRequest<'_, $update_req>,
            ) -> ServiceResult<$res> {
                let req = request.to_owned_message();
                let body = req.$body.into_option().ok_or_else(|| {
                    ConnectError::invalid_argument(concat!(stringify!($body), " is required"))
                })?;
                let name = body.name.clone();
                let props = resource_to_props(&body)?;
                Response::ok(self.core().update(&name, props).await?)
            }

            async fn $delete_fn(
                &self,
                _ctx: RequestContext,
                request: ServiceRequest<'_, $delete_req>,
            ) -> ServiceResult<$delete_resp> {
                let name = request.name.to_string();
                self.core().delete(&name).await?;
                Response::ok(<$delete_resp as ::core::default::Default>::default())
            }
        }
    };
}

crud_connect!(
    ProjectService, ObjectLabel::Project, Project, project,
    create = CreateProjectRequest,
    get = GetProjectRequest,
    list = ListProjectsRequest => ListProjectsResponse | projects,
    update = UpdateProjectRequest,
    delete = DeleteProjectRequest => DeleteProjectResponse,
    create_project, get_project, list_projects, update_project, delete_project
);

crud_connect!(
    RepositoryService, ObjectLabel::Repository, Repository, repository,
    create = CreateRepositoryRequest,
    get = GetRepositoryRequest,
    list = ListRepositoriesRequest => ListRepositoriesResponse | repositories,
    update = UpdateRepositoryRequest,
    delete = DeleteRepositoryRequest => DeleteRepositoryResponse,
    create_repository, get_repository, list_repositories, update_repository, delete_repository
);

crud_connect!(
    WebsiteService, ObjectLabel::Website, Website, website,
    create = CreateWebsiteRequest,
    get = GetWebsiteRequest,
    list = ListWebsitesRequest => ListWebsitesResponse | websites,
    update = UpdateWebsiteRequest,
    delete = DeleteWebsiteRequest => DeleteWebsiteResponse,
    create_website, get_website, list_websites, update_website, delete_website
);

crud_connect!(
    ReleaseService, ObjectLabel::Release, Release, release,
    create = CreateReleaseRequest,
    get = GetReleaseRequest,
    list = ListReleasesRequest => ListReleasesResponse | releases,
    update = UpdateReleaseRequest,
    delete = DeleteReleaseRequest => DeleteReleaseResponse,
    create_release, get_release, list_releases, update_release, delete_release
);

crud_connect!(
    ArtifactService, ObjectLabel::Artifact, Artifact, artifact,
    create = CreateArtifactRequest,
    get = GetArtifactRequest,
    list = ListArtifactsRequest => ListArtifactsResponse | artifacts,
    update = UpdateArtifactRequest,
    delete = DeleteArtifactRequest => DeleteArtifactResponse,
    create_artifact, get_artifact, list_artifacts, update_artifact, delete_artifact
);

crud_connect!(
    TaskService, ObjectLabel::Task, Task, task,
    create = CreateTaskRequest,
    get = GetTaskRequest,
    list = ListTasksRequest => ListTasksResponse | tasks,
    update = UpdateTaskRequest,
    delete = DeleteTaskRequest => DeleteTaskResponse,
    create_task, get_task, list_tasks, update_task, delete_task
);

#[allow(refining_impl_trait)]
impl AssociationService for Service {
    async fn add_association(
        &self,
        _ctx: RequestContext,
        request: ServiceRequest<'_, AddAssociationRequest>,
    ) -> ServiceResult<AddAssociationResponse> {
        let req = request.to_owned_message();
        self.core()
            .add_association(&req.from, &req.to, &req.label)
            .await?;
        Response::ok(AddAssociationResponse::default())
    }

    async fn remove_association(
        &self,
        _ctx: RequestContext,
        request: ServiceRequest<'_, RemoveAssociationRequest>,
    ) -> ServiceResult<RemoveAssociationResponse> {
        let req = request.to_owned_message();
        self.core()
            .remove_association(&req.from, &req.to, &req.label)
            .await?;
        Response::ok(RemoveAssociationResponse::default())
    }

    async fn list_associations(
        &self,
        _ctx: RequestContext,
        request: ServiceRequest<'_, ListAssociationsRequest>,
    ) -> ServiceResult<ListAssociationsResponse> {
        let req = request.to_owned_message();
        let label = req.label.filter(|l| !l.is_empty());
        let max = req.max_results.filter(|n| *n > 0).map(|n| n as usize);
        let token = req.page_token.filter(|t| !t.is_empty());
        let (triples, next) = self
            .core()
            .list_associations(&req.from, label.as_deref(), max, token)
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
        Response::ok(ListAssociationsResponse {
            associations,
            next_page_token: next,
            ..Default::default()
        })
    }
}
