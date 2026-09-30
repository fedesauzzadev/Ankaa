# Ankaa — air-gap image from the packed tarball.
# Build: docker build -f docker/Dockerfile --build-arg TARBALL=ankaa-cli-<version>.tgz .
# (place the tarball produced by scripts/pack-cli.mjs in the build context)
FROM node:22-alpine

ARG TARBALL=ankaa-cli-0.0.0-dev.tgz
COPY ${TARBALL} /tmp/ankaa-cli.tgz

RUN npm install -g --offline --no-audit --no-fund --ignore-scripts /tmp/ankaa-cli.tgz \
  && rm /tmp/ankaa-cli.tgz

# License via ANKAA_LICENSE_KEY (or --license-key / config license.key).
# Spec via volume: docker run --rm -v "$PWD:/specs" -e ANKAA_LICENSE_KEY=AGS-... ankaa analyze /specs/openapi.yaml
ENTRYPOINT ["ankaa"]
