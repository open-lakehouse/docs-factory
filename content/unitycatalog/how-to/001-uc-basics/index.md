---
title: Unity Catalog Securables
summary: Describe the basic sturctutre and asset hierarchy design of unity catalog.
diataxis: how-to
project: unitycatalog
status: idea
---

Unity catalog allows managing and governing various so called securables that are usually
encountered along the data & AI value chain and more generally when building lakehoue platforms.

We can distinguish two major flavours of securables and for the purposes of this guide we'll
refer to them as data plane and control plane securables. On the control plane we find
securables that are required to operate the platform and manage its resources, while
data plane securables are the kinds of assets that are being consumed/produced by your
users, pipelines, agents, and applications.

# Control Plane Securables

The main control plane securables in Unity Catalog are:
- External Locations
- Credentials
- Grants

External Locations often correspond to a bucket in a storage service such as S3.
Generally these are defined at the bucket root, since more fine granual access
control is modelled via the data plane securables. To access an external location,
usually a credential is required, which can be managed in UC via the Credential
securable.
