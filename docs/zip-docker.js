const zip = require('bestzip');

zip({
    source: ``,
    destination: `../../static/kcc-docker-jumpstart.zip`,
    cwd: `${__dirname}/build/docker-jumpstart`,
}).then(function() {
    console.log('Done zipping jumpstart');
}).catch(function(err) {
    console.error(err.stack);
    process.exit(1);
});
