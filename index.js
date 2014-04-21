var fs = require('fs');
var os = require('os');
var path = require('path');

var async = require('async');
var github = require('octonode');
var git = require('nodegit');

var client = github.client();

function arrayToDictionary(list, dict) {
  return list.reduce(function (dict, item) {
    dict[item[0]] = item[1];
    return dict;
  }, dict || {});
}

exports._arrayToDictionary = arrayToDictionary;

function findExistingRepositories(repositoriesPath, cb, open) {
  open = open || function (path, cb) {
    git.Repo.open(path, cb);
  };

  // Creates repositoies directory if not exist
  if (!fs.existsSync(repositoriesPath)) {
    fs.mkdirSync(repositoriesPath);
  } else if (!fs.lstatSync(repositoriesPath).isDirectory()) {
    throw new Error('Repositories path should be a directory');
  }

  var repositories = fs.readdirSync(repositoriesPath);

  // Check if git configuration is valid
  repositories = repositories.map(function (repositoryName) {
    var absolutePath = path.join(repositoriesPath, repositoryName);

    return function (cb) {
      open(absolutePath, function (err, repo) {
        if (err) { return cb(err, null); }

        cb(null, [repositoryName, repo]);
      });
    };
  });

  async.parallel(repositories, function (err, results) {
    if (err) { return cb(err, null); }

    results = arrayToDictionary(results);

    cb(null, results);
  });
}

exports.findExistingRepositories = findExistingRepositories;

var ghsearch = client.search();

function repoArrayToDictionary(array) {
  return array.reduce(function (dict, result) {
    dict[result.repository.name] = result.repository.html_url;
    return dict;
  }, {});
}

exports._repoArrayToDictionary = repoArrayToDictionary;

function cloneOrLoadRepositories(repositoriesPath, repositoriesWithChanges, cb) {
  // Load existing repositories
  findExistingRepositories(repositoriesPath, function (err, loadedRepositories) {
    if (err) { return cb(err, null); }

    // Filters the one that already exist
    var repositoryNamesToClone = Object.keys(repositoriesWithChanges).filter(function (repositoryName) {
      return !loadedRepositories[repositoryName];
    });

    // Clone the new repos
    var repositoriesToClone = repositoryNamesToClone.map(function (repositoryName) {
      return function (cb) {
        var pathToClone = path.join(repositoriesPath, repositoryName);
        var repositoryURL = repositoriesWithChanges[repositoryName];
        console.log('Clonning ' + repositoryURL + ' to ' + pathToClone);
        git.Repo.clone(repositoryURL, pathToClone, null, function (err, clonedRepository) {
          if (err) { cb(err, null); }
          cb(null, [repositoryName, clonedRepository]);
        });
      };
    });

    async.parallel(repositoriesToClone, function (err, clonedRepositories) {
      if (err) { return cb(err, null); }

      loadedRepositories = arrayToDictionary(clonedRepositories, loadedRepositories);

      cb(err, loadedRepositories);
    });
  });

}

function updateRepositories (repositories, cb) {
  var updates = Object.keys(repositories).map(function (repoName) {
    return function (cb) {
      var repo = repositories[repoName];
  
      var remote = repo.getRemote('origin');
  
      remote.connect(0, function (err) {
        if(err) { return cb(err, null); }
    
        remote.download(null, function (err) {
          if(err) { return cb(err, null); }
    
          cb(null, [repoName, repo]);
        });
      });
    };
  });

  async.parallel(updates, function (err, repositories) {
    if (err) { return cb(err); }

    repositories = arrayToDictionary(repositories);

    cb(null, repositories);
  });
}


function mv(from, to, cb) {
  var is = fs.createReadStream(from);
  var os = fs.createWriteStream(to);

  is.pipe(os);

  os.on('finish', function() {
    fs.unlink(from, function (err) {
      if (err) { return cb(err, null); }

      cb(null, to);
    });
  });
}


function inMemoryReplacement(regex, replacement, inputFilePath, cb) {
  fs.readFile(inputFilePath, function (err, content) {
    if (err) { return cb(err, null); }

    var tmpFile = path.join(os.tmpdir(), 'node-bounty-hounter- ' + Math.floor(Math.random() * 100000));
    content = content.toString('utf8');

    if (!regex.test(content)) {
      return cb(null, null);
    }

    content = content.replace(regex, replacement);

    fs.writeFile(tmpFile, content, function (err) {
      if (err) { return cb(err, null); }

      mv(tmpFile, inputFilePath, cb);
    });
  });
}

var queries = [{
  q: 'cdn.auth0.com/w2/auth0+user:auth0',
  sort: 'created',
  order: 'asc'
}, {
  q: 'd19p4zemcycm7a.cloudfront.net+user:auth0',
  sort: 'created',
  order: 'asc',
}];

var queriesAsFunctions = queries.map(function (query) {
  return function (cb) {
    ghsearch.code(query, function (err, results) {
      if (results.total_count !== results.items.length) {
        return cb(new Error('Error: The number of elements returned mismatch all the search results'), null);
      }

      cb(null, results);
    });
  };
});

async.parallel(queriesAsFunctions, function (err, results) {
  results = Array.prototype.concat.apply([], results.map(function (result) { return result.items; }));

  // Remove duplicates by making a dictionary out of repository URLs
  var repositoriesWithChanges = repoArrayToDictionary(results);

  var repositoriesPath = path.join(__dirname, 'repositories');

  cloneOrLoadRepositories(repositoriesPath, repositoriesWithChanges, function (err, repositories) {
    if (err) { throw err; }

    updateRepositories(repositories, function (err, repositories) {
      if (err) { throw err; }

      async.map(results, function (result, cb) {
        var repository = repositories[result.repository.name];
        var repositoryPath = path.dirname(repository.path());
        var filePath = path.join(repositoryPath,result.path);

        async.series([
        function (cb) {
          var regex = /d19p4zemcycm7a.cloudfront.net\/w2\/auth0-([0-9]{1,2}\.)+(min.)?js/g;
          var replacement = 'cdn.auth0.com/w2/auth0-2.0.15.js';

          inMemoryReplacement(regex, replacement, filePath, cb);
        }, function (cb) {
          var regex = /cdn.auth0.com\/w2\/auth0-([0-9]{1,2}\.)+(min.)?js/g;
          var replacement = 'cdn.auth0.com/w2/auth0-2.0.15.js';

          inMemoryReplacement(regex, replacement, filePath, cb);
        }, function (cb) {
          var regex = /d19p4zemcycm7a.cloudfront.net\/w2\/auth0-widget-([0-9]{1,2}\.)+(min.)?js/g;
          var replacement = 'cdn.auth0.com/w2/auth0-widget-3.0.12.js';

          inMemoryReplacement(regex, replacement, filePath, cb);
        }, function (cb) {
          var regex = /cdn.auth0.com\/w2\/auth0-widget-([0-9]{1,2}\.)+(min.)?js/g;
          var replacement = 'cdn.auth0.com/w2/auth0-widget-3.0.12.js';

          inMemoryReplacement(regex, replacement, filePath, cb);
        }, function (cb) {
          var regex = /cdn.auth0.com\/w2\/auth0-angular-([0-9]{1,2}\.)+(min.)?js/g;
          var replacement = 'cdn.auth0.com/w2/auth0-angular-0.2.0.js';

          inMemoryReplacement(regex, replacement, filePath, cb);
        }], function (err, result) {
          if (err) { return cb(err, null); }

          var hasResults = result.some(function (x) { return x; });

          cb(null, hasResults ? filePath : null);
        });

      }, function (err, replacedFiles) {
        if (err) { throw err; }

        replacedFiles.forEach(function (f) {
          console.log(f);
        });
      });
    });
  });
});
