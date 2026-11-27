# The Unity Catalog server image, adjusted for a local docs environment.
# A preview of 0.8 (unitycatalog#2289 on UC main), published by
# .github/workflows/uc-preview.yml. Back to the release image
# once 0.8.0 is out (#439).
FROM ghcr.io/open-lakehouse/docs-factory/unitycatalog:0.8.0-preview.096cd9c

USER root
# gcompat: on x86-64 the CLI's bundled snappy library needs glibc, and the
# image is Alpine. Group-writable etc/: the server may run under another uid
# (see run-as-owner) and still writes its database, logs, and sample data there.
RUN apk add --no-cache gcompat su-exec \
 && chmod -R g+w etc \
 && mv bin/uc bin/uc-cli
COPY --chmod=0755 run-as-owner /usr/local/bin/run-as-owner
COPY --chmod=0755 uc bin/uc

ENTRYPOINT ["run-as-owner"]
CMD ["./bin/start-uc-server"]
