# ApiGovScan — air-gap image from the packed tarball.
# Build: docker build -f docker/Dockerfile --build-arg TARBALL=apigovscan-cli-<version>.tgz .
# (place the tarball produced by scripts/pack-cli.mjs in the build context)
FROM node:20-alpine

ARG TARBALL=apigovscan-cli-0.0.0-dev.tgz
COPY ${TARBALL} /tmp/apigovscan-cli.tgz

RUN npm install -g --offline --no-audit --no-fund --ignore-scripts /tmp/apigovscan-cli.tgz \
  && rm /tmp/apigovscan-cli.tgz

# License via APIGOVSCAN_LICENSE_KEY (or --license-key / config license.key).
# Spec via volume: docker run --rm -v "$PWD:/specs" -e APIGOVSCAN_LICENSE_KEY=AGS-... apigovscan analyze /specs/openapi.yaml
ENTRYPOINT ["apigovscan"]
