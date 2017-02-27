/* global sinon */

import GitHub from 'github-api';
import find from 'lodash/find';
import map from 'lodash/map';
import gitHub from '../../src/services/gitHub';

export default class MockGitHub {
  constructor(sandbox) {
    this._activeClient = sinon.createStubInstance(GitHub);
    this._activeClient.getGist.returns({
      read: () => new Promise(() => {}),
    });
    sandbox.stub(gitHub, 'anonymous', () => this._activeClient);
  }

  loadGist(data) {
    this._activeClient.getGist.withArgs(data.id).returns({
      read: () => Promise.resolve({data}),
    });
  }

  gistNotFound(gistId) {
    this._activeClient.getGist.withArgs(gistId).returns({
      read: () => Promise.reject({response: {status: 404}}),
    });
  }

  gistError(gistId) {
    this._activeClient.getGist.withArgs(gistId).returns({
      read: () => Promise.reject(new Error()),
    });
  }

  loadRepo(user, repo, ...contents) {
    const repository = {
      getContents() {
        return Promise.resolve({
          data: map(contents, ({name, sha}) => ({name, sha})),
        });
      },
      getBlob(sha) {
        const blob = find(contents, {sha});
        return blob ?
          Promise.resolve({data: blob.data}) :
          Promise.reject({response: {status: 404}});
      },
    };
    this._activeClient.getRepo.withArgs(user, repo).returns(repository);
  }

  loadRepoButBrokenBlobs(user, repo, ...contents) {
    const repository = {
      getContents() {
        return Promise.resolve({
          data: map(contents, ({name, sha}) => ({name, sha})),
        });
      },
      getBlob() {
        return Promise.reject({response: {status: 500}});
      },
    };
    this._activeClient.getRepo.withArgs(user, repo).returns(repository);
  }

  repoNotFound(user, repo) {
    const repository = {
      getContents() {
        return Promise.reject({response: {status: 404}});
      },
    };
    this._activeClient.getRepo.withArgs(user, repo).returns(repository);
  }

  repoError(user, repo) {
    const repository = {
      getContents() {
        return Promise.reject({message: 'oops'});
      },
    };
    this._activeClient.getRepo.withArgs(user, repo).returns(repository);
  }
}
