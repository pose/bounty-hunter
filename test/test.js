var assert = require('assert');
var fs = require('fs');

var mockFs = require('mock-fs');

var arrayToDictionary = require('..')._arrayToDictionary;

var findExistingRepositories = require('..').findExistingRepositories;

var repoArrayToDictionary = require('..')._repoArrayToDictionary;

var streamReplacement = require('..').streamReplacement;

describe('arrayToDictionary', function () {
  describe('with empty list', function () {
    it('should convert empty list successfully', function () {
      assert.deepEqual({}, arrayToDictionary([]));
    });

    it('should return the same dictionary when passed as second argument', function () {
      var dict = {foo: 'bar'};

      assert.equal(dict, arrayToDictionary([], dict));
    });
  });

  describe('with non-empty list', function () {
    it('should convert array of pairs to dictionary entries', function () {
      var dict = arrayToDictionary([['foo', 'bar'], ['baz', 3]]);

      assert.equal(2, Object.keys(dict).length);
      assert.equal('bar', dict.foo);
      assert.equal(3, dict.baz);
    });
    it('should extend dictionary when passed as second argument', function () {
      var dict  = {hello: 'bye'};
      var dict2 = arrayToDictionary([['foo', 'bar']], dict);

      assert.equal(dict, dict2);
      assert.equal(2, Object.keys(dict).length);
      assert.equal('bye', dict.hello);
      assert.equal('bar', dict.foo);
    });
  });
});

describe('findExistingRepositories', function () {

  beforeEach(function () {
    mockFs({
      'fakedir/repositories': {
        foo: {
          hello: ''
        },
        bar: {
          bye: ''
        }
      },
      emptyDir: {}
    });
  });

  afterEach(mockFs.restore);

  it('should create folder when not existant', function (done) {
    findExistingRepositories('emptyDir/repositories', function (err, repos) {
      assert.equal(null, err);
      assert.deepEqual([], repos);
      assert.notEqual(-1, fs.readdirSync('').indexOf('emptyDir'));
      assert.notEqual(-1, fs.readdirSync('emptyDir').indexOf('repositories'));
      done();
    });
  });


  it('should list git repositories on folder', function (done) {
    findExistingRepositories('fakedir/repositories', function (err, repos) {
      assert.equal(null, err);

      assert.equal('bye', repos.bar);
      assert.equal('hello', repos.foo);

      done();
    }, fs.readdir);
  });
});

describe('repoArrayToDictionary', function () {
 
  it('should convert empty list of repositories to a empty dictionary', function () {
    assert.deepEqual({}, repoArrayToDictionary([]));
  });

  it('should convert a list of repositories to a dictionary', function () {
    var fixture = [{
      repository: {
        name: 'foo',
        url: 'http://url/to/foo/'
      }},{
        repository: {
          name: 'bar',
          url: 'http://url/to/bar/'
        }}
    ];
    var result = repoArrayToDictionary(fixture);

    assert.deepEqual(fixture[0].repository.html_url, result.foo);
    assert.deepEqual(fixture[1].repository.html_url, result.bar);
  });
});
