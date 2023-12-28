const zip = require('bestzip');

zip({
    // source: ``,
    source: `docker-jumpstart`,
    // destination: `assets/kcc-docker-jumpstart.zip`,
    destination: `../static/assets/kcc-docker-jumpstart.zip`,
    cwd: `${__dirname}/build/`,
}).then(function() {
    console.log('Done zipping jumpstart');
}).catch(function(err) {
    console.error(err.stack);
    process.exit(1);
});
