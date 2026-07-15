| Review tracker |  |  |  |
| :-- | :-- | :-- | :-- |
| ![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdYnggp_TACOCZoPhSJPFBum75v4W9TeVpPg9REwYc3GnEvxjSB-ETpiJ_akgw9cj18FzpyL8tbuM_fyVLYqRck7sWy2cSXLhTWG4nm3v0fFm9rnHDstnNSBesaw_ycwXNdSOD3yHzOC4WC41YtJwzD6XTCD-DFlrPqq-dQoj-i9FeIhQY=s2048?key=QygJIYfNklxOTaCahj8RNQ) Assignee | ![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcutHfuHXjo-WwokQhgLaLzCqKT2iYXlWWdcHeWgFUYUseBaXoSorDJS5AEEgU6MthdiNcui_XXvYJON8PEESHLKygnDU5OPN0LUZm7HysYbRZKz036LLM_dKFW8p9nIx8abdBOQWkDv46ZpGSugdHzxEZRCduXyKjzn0oprd9DgIAy0WBs1g=s2048?key=QygJIYfNklxOTaCahj8RNQ) Comment | ![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeqFjkGdD4o5pks3UjyToi4Cg7QwmCs7nWQjTFSZ9UcZqQdaI8TQkoowDdGEuc4yMoKTv0ONOwyTmoKmTFLEdSPcCuKLkGCQ0eY8GCm5inhCsJpxe1fgV-O-gT972Zpijfam_dxKNDg-WKpV9XdHfls0QXjc5FTlR3IUysGele9_eLOz5Sglg=s2048?key=QygJIYfNklxOTaCahj8RNQ) Date | ![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcKiHd_TWEs1Zoxx06DGtdQYIz-b_A7BImV9tx1sc4NNQqVZRHytr_Ky_C39yMdMfbMB1ItY03Y6Ne53gNU-UWEkHEPXrHPfIOUalbSg3xe2VwjIkTeigoBBYjkEJVCjhwGIb3pXNfDdfNYNLNhShe3rhiLxQJKk4zGEJ0braKVR1bjKe-46w=s2048?key=QygJIYfNklxOTaCahj8RNQ) Status |
| [Michelle Leon](mailto:michelle.leon@databricks.com) |  |  |  |
| [Tathagata “TD” Das](mailto:tdas@databricks.com) |  |  |  |
| [Alex Jiang](mailto:alex.jiang@databricks.com) | I like how conversational this reads; big fan of the structure/simplicity. There are a few terms that I suggest changing due to potential cause for confusion (e.g. managing storage, managed storage, agents need agency).  I also feel the distinction between managed and external location needs to be made more clear. | Mar 17, 2026 |  |
| [Nishith Agarwal](mailto:nishith.agarwal@databricks.com) |  |  |  |
| [Zheng Hu](mailto:zheng.hu@databricks.com) |  |  |  |
| [Scott Haines](mailto:scott.haines@databricks.com) |  |  |  |


# TL;DR

This blog highlights both the power and the complexity of working with storage services in a Lakehouse platform. The resulting message should be:

- Unity Catalog can make your everyday life much easier
- Unity Catalog allows you to scale 


---


# Managing storage and managed storage

## Managing storage for managed storage

When moving around the general area where one of my previous employers operated, it was always very easy to spot colleagues, even in civilian life. When moving up or down any stairs, we would walk in a neat line, holding on to the handrail as if our life depended on it. In fact, we were almost taught as such, and even if there was only a single step, there would be prominent signs reminding us to always use the handrail. You may wonder why this is relevant to the world of data. Let me explain!


When first starting, I found this funny, but as you experience the realities of one of the biggest manufacturing sites in the world - trains, cars, bikes, autonomous vehicles, drones, and much more constantly moving about in confined spaces - you realize that safety needs to become an automatic reaction and ingrained in your day to day rather than something you assess case by case.


In many ways, your lakehouse is no different; a plethora of file-based assets needs to be stored, discovered, accessed, and governed. I learned the hard way that you should always assume your work will end up in production and default to best practices in all facets of your craft. This includes things like using git whenever you work with code and, of course, properly handling authentication and authorization when accessing remote services.


In this blog post, we will explore how Unity Catalog can help teams and organizations of any size streamline and foster collaboration among (data-)teams, appease the CSIO and their posse, and improve the quality of (working) life by simplifying many day-to-day tasks.

# It's all just files

Storage is at the heart of every Lakehouse; Most of the core artifacts that one encounters along the data value chain boil down to files stored on disk - data files, open tables, notebooks, ML models, and, more recently, skills and other agent extensions - are all stored as files on disk. 


Unsurprisingly, storage services are the most foundational building block in the Lakehouse Architecture as well as a constant source of headache for platform builders/operators, security professionals, and data practitioners:

- Credentials get committed to repositories
- Naming conventions and folder structures don't age well
- User-groups, access control lists, and policies sprawl uncontrollably


… and the list goes on.


You'll be surprised, but Unity Catalog (UC) provides solutions that mitigate these challenges, low-effort and effective, akin to always using the handrail when climbing the stairs along the data value chain. Let's examine the core securables/abstractions that enable a surprisingly large number of use-cases, namely credentials, external locations, and managed locations.


**Credentials** are just that, some form of secret that allows establishing trust with some other service or actor, in our case, a storage bucket (also called a container sometimes). There are many different flavours of credentials, such as passwords, tokens, and certificates.


**External Locations** are essentially URLs that reference a storage location (e.g., s3://my-bucket/path), along with a credential to access it.


In many ways, that's already it!


Unity Catalog uses these basic abstractions to implement higher-level securables.

- Tables: just a path within a location where the table files are stored, hopefully in an open table format like Delta or Iceberg.
- Volumes: again, just a path with a location where arbitrary files might be stored
- Models: guess what - it's just files, hopefully in some open and interchangeable format like ONNX.


They also enable another key capability, **Managed Locations**. As we all know, [naming things is hard](https://martinfowler.com/bliki/TwoHardThings.html), and once we do, we usually regret it shortly after. To help remove this mental burden to a degree, or at least make naming your database/schema/table more of a two-way door, UC offers Managed Locations, which abstracts away all the low-level decisions associated with creating a sustainable physical naming and storage schema.


So now that we can store files, we need to enable folks to access data across our ginormous data estate, spanning many buckets and nested path hierarchies.

# Agents need agency

I'll diverge from the current vernacular and say that all of us are agents, and that to effectively operate on a data platform, any agent needs agency.


   *agency (noun): the ability to take action or to choose what action to take*
   [Cambridge Dictionary](https://dictionary.cambridge.org/dictionary/english/agency)


How does one attain agency? In technical terms, this is ideally done via an Identity Provider (IdP), which allows a principal (human or machine) to prove to other services that they are who they claim to be - referred to as authentication. This is clearly separate from authorization, which is the process of deciding if a given principal is allowed to perform some action - picking an example at random:  reading data from a given storage location. 


And authorization is where things get hairy sometimes:

- Distributing storage credentials directly to users (e.g., access keys) circumvents authentication
- Access controls work well as a "binary switch" on the bucket level, but fail to scale on a path/file level
- Maintaining access based on semantic concepts (e.g., catalog/schema/table) is hard to synchronize as the data estate grows
- …


This is where a new, securable - Grants - and another conceptually simple yet surprisingly powerful concept kick in: credential vending.


Grants are assignments of permissions to principals.


```
GRANT CREATE CATALOG ON METASTORE TO engineering
```


When a principal now wants to access any file- or path-based asset, it acquires a token from the identity provider - outside of UC and fully owned by your Org - to prove its identity to UC. The client then requests a credential to access a specific asset and receives a downscoped token valid for a limited time to access the storage location where the asset resides. There are a few important aspects to take note of here:

- The client/agent only needs to prove its identity, but never receives any credentials with a significant blast radius.
- Any policy change propagates almost immediately (the longest delay is the lifetime of a vended token); no need to invalidate or rotate any credentials.

# Summary

Using Unity Catalog to maintain a registry of external locations (provisioned storage buckets) and the credentials to access them, you can meet the growing demands of your data and security teams for secure and governed access to data across the entire data estate.

- Long-lived, powerful credentials are contained in a single location
- Users only use short-lived, downscoped credentials to access tables and volumes
- Managed locations help maintain a well-structured layout of the on-disk data

# Try this at home


For convenience, let's define an alias that lets us use the Unity catalog CLI without any local setup beyond Docker.


```
alias uc='docker run -it --network="host" unitycatalog/unitycatalog:latest ./bin/uc --server http://localhost:8080'
```


The first thing to do is get a Unity Catalog instance up and running.


```
docker run -p 8080:8080 unitycatalog/unitycatalog:all-in-one
```


This starts a standalone instance of Unity Catalog using in-memory storage, so data won't be persisted across restarts. For alternative deployment options, see the [documentation](https://docs.unitycatalog.io/deployment/).


For this example to be meaningful, we need an external storage service to persist our data. So let's create an S3 bucket and a role we can use with IAM Everywhere.


TODO


Create a credential


```
uc credential create \
  --name my-s3-credential \
  --aws-iam-role-arn arn:aws:iam::123456789012:role/my-data-role
```


Register the bucket as an external location within UC.


```
bin/uc external-location create \
  --name my-s3-data \
  --url s3://my-bucket/data \
  --credential-name my-s3-credential
```





---


```
builder = (
    pyspark.sql.SparkSession.builder.appName("external-credential")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config(
        "spark.sql.catalog.spark_catalog",
        "io.unitycatalog.spark.UCSingleCatalog",
    )
    .config(
        f"spark.sql.catalog.{catalog_name}",
        "io.unitycatalog.spark.UCSingleCatalog",
    )
    .config(
        f"spark.sql.catalog.{catalog_name}.uri",
        f"{workspace_url}",
    )
    .config(f"spark.sql.catalog.{catalog_name}.auth.type", "oauth")
    .config(
        f"spark.sql.catalog.{catalog_name}.auth.oauth.uri",
        f"https://accounts.cloud.databricks.com/oidc/accounts/{account_id}/v1/token",
    )
    .config(f"spark.sql.catalog.{catalog_name}.auth.oauth.clientId", clientId)
    .config(
        f"spark.sql.catalog.{catalog_name}.auth.oauth.clientSecret", secret
    )
    .config(
        "spark.hadoop.fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem"
    )
    .config("spark.sql.defaultCatalog", catalog_name)
)
```


```
extra_packages = [
    "io.unitycatalog:unitycatalog-spark_2.13:0.4.0",
    "org.apache.hadoop:hadoop-aws:3.4.0",
]
```


```
spark = configure_spark_with_delta_pip(
    builder, extra_packages=extra_packages
).getOrCreate()
```
