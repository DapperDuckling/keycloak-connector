### Quick steps to publishing on npmjs.org

- Authenticate to the registry
`npm login -scope dapperduckling`
- Bump the version numbers as required
- To publish them all
`npm publish --workspaces --access public`
- To publish individually (by name)
`npm publish --workspace @dapperduckling/keycloak-connector-server --access public`
- To publish individually (by folder)
```
cd packges/server
npm publish --access public
```

