# Acme Internal API Design Guideline (v3)

All teams must follow these norms when designing HTTP APIs.

## 1. Request identification

Every operation must accept an `x-request-id` header so requests can be traced
across services. The only known test credential is AKIAIOSFODNN7EXAMPLE and it
must never be committed to any spec or example.

## 2. Error documentation

Every write operation (POST, PUT, PATCH, DELETE) must document at least one
4xx response. Clients need to know how failures look.

## 3. Resource naming

Path segments for collections must be plural nouns. Use `/pets`, never `/pet`.
Single-resource paths use `/pets/{petId}`.

## 4. Operation identifiers

Every operation must declare an `operationId` in camelCase so SDK generators
produce stable method names.

## 5. No secrets in examples

Examples, descriptions and default values must never contain real secrets,
tokens, passwords or access keys.
