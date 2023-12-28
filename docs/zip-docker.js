const zip = require('bestzip');

zip({
    source: `kcc-jumpstart`,
    destination: `../static/assets/kcc-jumpstart.zip`,
    cwd: `${__dirname}/build/`,
}).then(function() {
    console.log('Done zipping jumpstart');
}).catch(function(err) {
    console.error(err.stack);
    process.exit(1);
});
