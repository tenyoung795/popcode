/* eslint-env mocha */
/* global sinon */

import '../../helper';
import {assert} from 'chai';
import property from 'lodash/property';
import {bootstrap} from '../../../src/actions';
import MockFirebase from '../../helpers/MockFirebase';
import MockGitHub from '../../helpers/MockGitHub';
import buildProject from '../../helpers/buildProject';
import buildGist from '../../helpers/buildGist';
import waitForAsync from '../../helpers/waitForAsync';
import {getCurrentProject} from '../../../src/util/projectUtils';
import createApplicationStore from '../../../src/createApplicationStore';

describe('bootstrap', () => {
  let store, sandbox, mockFirebase, mockGitHub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    mockFirebase = new MockFirebase(sandbox);
    mockGitHub = new MockGitHub(sandbox);
    store = createApplicationStore();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('no gist ID', () => {
    context('before auth resolves', () => {
      beforeEach(() => dispatchBootstrap({}));

      it('should have no current project by default', () => {
        assert.isNull(
          store.getState().getIn(['currentProject', 'projectKey']),
        );
      });
    });

    context('when auth resolves logged out', () => {
      beforeEach(() => {
        mockFirebase.logOut();
        return dispatchBootstrap({});
      });

      it('should create a new current project', () => {
        assert.isNotNull(
          store.getState().getIn(['currentProject', 'projectKey']),
        );
      });

      it('should set user to logged out', () => {
        assert.isNotTrue(store.getState().getIn(['user', 'authenticated']));
      });
    });

    context('when auth resolves logged in', () => {
      const uid = '123';

      context('no credential in Firebase', () => {
        beforeEach(() => {
          mockFirebase.logIn(uid);
          mockFirebase._setValue(`authTokens/${uid}/github_com`, null);
          mockFirebase.setCurrentProject(null);
          return dispatchBootstrap({});
        });

        it('should not log the user in', () => {
          assert.isFalse(store.getState().getIn(['user', 'authenticated']));
        });

        it('should create a new current project', async () => {
          await Promise.resolve();
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
        });
      });

      context('credential in Firebase', () => {
        let credential;

        context('no current project in Firebase', () => {
          beforeEach(() => {
            credential = mockFirebase.logIn(uid).credential;
            mockFirebase.setCurrentProject(null);
            return dispatchBootstrap({});
          });

          it('should log the user in', () => {
            assert.isTrue(store.getState().getIn(['user', 'authenticated']));
          });

          it('should set credential', () => {
            assert.equal(
              store.getState().getIn(['user', 'accessTokens', 'github.com']),
              credential.accessToken,
            );
          });

          it('should create a new current project', async () => {
            await Promise.resolve();
            assert.isNotNull(
              store.getState().getIn(['currentProject', 'projectKey']),
            );
          });
        });

        context('current project in Firebase', () => {
          let project;

          beforeEach(() => {
            project = buildProject({sources: {html: 'bogus<'}});
            credential = mockFirebase.logIn(uid).credential;
            mockFirebase.setCurrentProject(project);
            return dispatchBootstrap({});
          });

          it('should create a new project', () => {
            assert.notEqual(
              store.getState().getIn(['currentProject', 'projectKey']),
              project.projectKey,
            );
          });
        });
      });
    });
  });

  context('with gist ID', () => {
    const gistId = '12345';

    context('before auth or gist resolve', () => {
      beforeEach(() => dispatchBootstrap({gist: gistId}));

      it('should have no current project', () => {
        assert.isNull(
          store.getState().getIn(['currentProject', 'projectKey']),
        );
      });
    });

    context('if only auth has resolved', () => {
      beforeEach(() => {
        mockFirebase.logOut();
        return dispatchBootstrap({gist: gistId});
      });

      it('should have no current project', () => {
        assert.isNull(
          store.getState().getIn(['currentProject', 'projectKey']),
        );
      });
    });

    context('if only gist has resolved', () => {
      beforeEach(() => {
        mockGitHub.loadGist(buildGist(gistId));
        return dispatchBootstrap({gist: gistId});
      });

      it('should have no current project', () => {
        assert.isNull(
          store.getState().getIn(['currentProject', 'projectKey']),
        );
      });
    });

    context('with gist resolved', () => {
      const javascript = '// imported from Gist';

      beforeEach(() => {
        mockGitHub.loadGist(buildGist(gistId, {sources: {javascript}}));
      });

      context('with logged out user', () => {
        beforeEach(() => {
          mockFirebase.logOut();
          return dispatchBootstrap({gist: gistId});
        });

        it('should have a current project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
        });

        it('should use the gist data in the current project', () => {
          assert.equal(
            getCurrentProject(store.getState()).sources.javascript,
            javascript,
          );
        });
      });

      context('with logged in user and current project', () => {
        beforeEach(() => {
          mockFirebase.logIn('123');
          mockFirebase.setCurrentProject(buildProject());
          return dispatchBootstrap({gist: gistId});
        });

        it('should have a current project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
        });

        it('should use the gist data in the current project', () => {
          assert.equal(
            getCurrentProject(store.getState()).sources.javascript,
            javascript,
          );
        });
      });
    });

    describe('gist scenarios', () => {
      context('no enabled libraries', () => {
        beforeEach(() => {
          const gist = buildGist(gistId);
          Reflect.deleteProperty(gist.files, 'popcode.json');
          mockGitHub.loadGist(gist);
          mockFirebase.logOut();
          return dispatchBootstrap({gist: gistId});
        });

        it('should add empty libraries by default', () => {
          assert.deepEqual(
            getCurrentProject(store.getState()).enabledLibraries,
            [],
          );
        });
      });

      context('enabled libraries', () => {
        beforeEach(() => {
          const gist = buildGist(gistId, {enabledLibraries: ['jquery']});
          mockGitHub.loadGist(gist);
          mockFirebase.logOut();
          return dispatchBootstrap({gist: gistId});
        });

        it('should load libraries into project', () => {
          assert.include(
            getCurrentProject(store.getState()).enabledLibraries,
            'jquery',
          );
        });
      });

      context('not found', () => {
        beforeEach(() => {
          mockFirebase.logOut();
          mockGitHub.gistNotFound(gistId);
          return dispatchBootstrap({gist: gistId});
        });

        it('should create a new project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
        });

        it('should add a notification', () => {
          assert.include(
            store.getState().getIn(['ui', 'notifications']).toJS().
            map(property('type')),
            'gist-import-not-found',
          );
        });
      });

      context('import error', () => {
        beforeEach(() => {
          mockFirebase.logOut();
          mockGitHub.gistError(gistId);
          return dispatchBootstrap({gist: gistId});
        });

        it('should create a new project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
        });

        it('should add a notification', () => {
          assert.include(
            store.getState().getIn(['ui', 'notifications']).toJS().
            map(property('type')),
            'gist-import-error',
          );
        });
      });
    });
  });

  describe('importing a repository', () => {
    const owner = 'popcodeorg';
    const name = 'popcode';
    const uid = '123';

    context('logged out', () => {
      beforeEach(() => mockFirebase.logOut());

      context('user accepts', () => {
        beforeEach(() => mockFirebase.userAccepts(uid));
        whenLoggedIn();
      });

      context('user cancels', () => {
        beforeEach(() => {
          mockFirebase.userCancels();
          return dispatchBootstrap({user: owner, repo: name});
        });

        it('should create a new regular project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
          assert.notProperty(getCurrentProject(store.getState()), 'repo');
        });

        it('should add a notification', () => {
          assert.include(
            store.getState().getIn(['ui', 'notifications']).toJS().
            map(property('type')),
            'user-cancelled-repo-auth',
          );
        });
      });
    });

    context('logged in', () => {
      beforeEach(() => mockFirebase.logIn(uid));
      whenLoggedIn();
    });

    function whenLoggedIn() {
      const html = {
        name: 'index.html',
        sha: 1,
        data: `<!DOCTYPE html>
<html>
  <head>
    <title>Imported from master</title>
  </head>
  <body>
    <p>Imported from master</p>
  </body>
</html>
`,
      };
      const css = {
        name: 'styles.css',
        sha: 2,
        data: '# Imported from master\n',
      };
      const javascript = {
        name: 'script.js',
        sha: 3,
        data: '// Imported from master\n',
      };
      const popcode = {
        name: 'popcode.json',
        sha: 4,
        data: `{
  "enabledLibraries": [
    "jquery"
  ]
}
`,
      };

      context('when the repository exists and blobs work', () => {
        beforeEach(() => mockGitHub.loadRepo(
          owner, name, html, css, javascript, popcode,
        ));

        context('when the user never imported the repository before', () => {
          const project = buildProject(
            {repo: {owner: 'github', name: 'gitignore'}},
          );

          beforeEach(() => {
            mockFirebase.setCurrentProject(project);
            return dispatchBootstrap({user: owner, repo: name});
          });

          it('should create a new project', () => {
            assert.notEqual(
              store.getState().getIn(['currentProject', 'projectKey']),
              project.projectKey,
            );
          });

          it('should set html', () => {
            assert.deepPropertyVal(
              getCurrentProject(store.getState()),
              'sources.html',
              html.data,
            );
          });

          it('should set css', () => {
            assert.deepPropertyVal(
              getCurrentProject(store.getState()),
              'sources.css',
              css.data,
            );
          });

          it('should set javascript', () => {
            assert.deepPropertyVal(
              getCurrentProject(store.getState()),
              'sources.javascript',
              javascript.data,
            );
          });

          it('should load libraries', () => {
            assert.include(
              getCurrentProject(store.getState()).enabledLibraries,
              'jquery',
            );
          });

          aboutTheCurrentProject();
        });

        context('when the user imported the repository before', () => {
          const project = buildProject({repo: {owner, name}});

          beforeEach(() => {
            mockFirebase.setCurrentProject(project);
            return dispatchBootstrap({user: owner, repo: name});
          });

          it('should find the repo project', () => {
            assert.equal(
              store.getState().getIn(['currentProject', 'projectKey']),
              project.projectKey,
            );
          });

          it('should not set html', () => {
            assert.deepPropertyNotVal(
              getCurrentProject(store.getState()),
              'sources.html',
              html.data,
            );
          });

          it('should not set css', () => {
            assert.deepPropertyNotVal(
              getCurrentProject(store.getState()),
              'sources.css',
              css.data,
            );
          });

          it('should not set javascript', () => {
            assert.deepPropertyNotVal(
              getCurrentProject(store.getState()),
              'sources.javascript',
              javascript.data,
            );
          });

          it('should not load libraries', () => {
            assert.notInclude(
              getCurrentProject(store.getState()).enabledLibraries,
              'jquery',
            );
          });

          aboutTheCurrentProject();
        });

        function aboutTheCurrentProject() {
          it('should save the repo owner', () => {
            assert.deepPropertyVal(
              getCurrentProject(store.getState()), 'repo.owner', owner,
            );
          });

          it('should save the repo name', () => {
            assert.deepPropertyVal(
              getCurrentProject(store.getState()), 'repo.name', name,
            );
          });
        }
      });

      context('when the repository exists but the blobs are broken', () => {
        beforeEach(() => {
          mockGitHub.loadRepoButBrokenBlobs(
            owner, name, html, css, javascript, popcode,
          );
          return dispatchBootstrap({user: owner, repo: name});
        });

        it('should create a new regular project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
          assert.notProperty(getCurrentProject(store.getState()), 'repo');
        });

        it('should add a notification', () => {
          assert.include(
            store.getState().getIn(['ui', 'notifications']).toJS().
            map(property('type')),
            'repo-import-error',
          );
        });
      });

      context('when the repository is not found', () => {
        beforeEach(() => {
          mockGitHub.repoNotFound(owner, name);
          return dispatchBootstrap({user: owner, repo: name});
        });

        it('should create a new regular project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
          assert.notProperty(getCurrentProject(store.getState()), 'repo');
        });

        it('should add a notification', () => {
          assert.include(
            store.getState().getIn(['ui', 'notifications']).toJS().
            map(property('type')),
            'repo-import-not-found',
          );
        });
      });

      context('when another repository error happens', () => {
        beforeEach(() => {
          mockGitHub.repoError(owner, name);
          return dispatchBootstrap({user: owner, repo: name});
        });

        it('should create a new regular project', () => {
          assert.isNotNull(
            store.getState().getIn(['currentProject', 'projectKey']),
          );
          assert.notProperty(getCurrentProject(store.getState()), 'repo');
        });

        it('should add a notification', () => {
          assert.include(
            store.getState().getIn(['ui', 'notifications']).toJS().
            map(property('type')),
            'repo-import-error',
          );
        });
      });
    }
  });

  describe('attempt to import both a gist and a repository', () => {
    const gistId = '12345';
    const gistJs = '// imported from Gist';

    const owner = 'popcodeorg';
    const name = 'popcode';

    beforeEach(() => {
      mockGitHub.loadGist(buildGist(gistId, {sources: {javascript: gistJs}}));
      mockGitHub.loadRepo(owner, name);
    });

    context('logged out', () => {
      beforeEach(() => mockFirebase.logOut());
      tests();
    });

    context('logged in', () => {
      beforeEach(() => mockFirebase.logIn('123'));
      tests();
    });

    function tests() {
      beforeEach(() =>
        dispatchBootstrap({gist: gistId, user: owner, repo: name}),
      );

      it('should still have a current project', () => {
        assert.isNotNull(
          store.getState().getIn(['currentProject', 'projectKey']),
        );
      });

      it('should refuse to import the gist', () => {
        assert.notEqual(
          getCurrentProject(store.getState()).sources.javascript,
          gistJs,
        );
      });

      it('should refuse to import the repository', () => {
        assert.notProperty(getCurrentProject(store.getState()), 'repo');
      });

      it('should add a notification', () => {
        assert.include(
          store.getState().getIn(['ui', 'notifications']).toJS().
          map(property('type')),
          'url-query-error',
        );
      });
    }
  });

  function dispatchBootstrap(query) {
    store.dispatch(bootstrap(query));
    return waitForAsync();
  }
});
