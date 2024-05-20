### Installing Lerna
`npm install -g lerna`

### Quick steps to publishing on npmjs.org

- Authenticate to the registry
    ```
    npm login --scope dapperduckling
    ```

- Update version and publish the package
  ```
  lerna publish --no-private
  ```

