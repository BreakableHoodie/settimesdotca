# Interactive OpenAPI Explorer

The full REST API surface, rendered directly from the OpenAPI contract that
[`scripts/validate-openapi.mjs`](https://github.com/BreakableHoodie/settimesdotca/blob/main/scripts/validate-openapi.mjs)
validates in CI — this page and the API can never drift silently out of sync
with each other's _shape_ (though keeping the spec itself accurate is still
a manual discipline).

For prose context — auth model, rate limits, error conventions — see the
[API Documentation](../API_DOCUMENTATION.md) page first.

<swagger-ui src="../api-spec.yaml"/>
