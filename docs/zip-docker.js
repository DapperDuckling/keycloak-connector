const zip = require('bestzip');

zip({
    source: `kcc-quickstart`,
    destination: `../static/assets/kcc-quickstart.zip`,
    cwd: `${__dirname}/build/`,
}).then(function() {
    console.log('Done zipping quickstart');
}).catch(function(err) {
    console.error(err.stack);
    process.exit(1);
});
