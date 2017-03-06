import fs from 'fs';
import path from 'path';
import React from 'react';
import {connect} from 'react-redux';
import values from 'lodash/values';
import bindAll from 'lodash/bindAll';
import includes from 'lodash/includes';
import isEmpty from 'lodash/isEmpty';
import isNull from 'lodash/isNull';
import partial from 'lodash/partial';
import sortBy from 'lodash/sortBy';
import map from 'lodash/map';
import isError from 'lodash/isError';
import isString from 'lodash/isString';
import {t} from 'i18next';
import qs from 'qs';
import base64 from 'base64-js';
import {TextEncoder} from 'text-encoding';
import Bugsnag from '../util/Bugsnag';
import Gists, {EmptyGistError} from '../services/Gists';
import {
  onSignedIn,
  onSignedOut,
  signIn,
  signOut,
  startSessionHeartbeat,
} from '../clients/firebaseAuth';
import {openWindowWithWorkaroundForChromeClosingBug} from '../util';

import {
  addRuntimeError,
  changeCurrentProject,
  clearRuntimeErrors,
  createProject,
  updateProjectSource,
  logIn,
  logOut,
  toggleLibrary,
  minimizeComponent,
  maximizeComponent,
  toggleDashboard,
  toggleDashboardSubmenu,
  userTyped,
  userRequestedFocusedLine,
  editorFocusedRequestedLine,
  notificationTriggered,
  userDismissedNotification,
  exportingGist,
  bootstrap,
} from '../actions';

import {getCurrentProject, isPristineProject} from '../util/projectUtils';

import EditorContainer from './EditorContainer';
import Editor from './Editor';
import Output from './Output';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import NotificationList from './NotificationList';
import PopThrobber from './PopThrobber';

const spinnerPage = base64.fromByteArray(
  new TextEncoder('utf-8').encode(
    fs.readFileSync(
      path.join(
        __dirname,
        '../../templates/github-export.html',
      ),
    ),
  ),
);

function mapStateToProps(state) {
  const projects = sortBy(
    values(state.get('projects').toJS()),
    project => -project.updatedAt,
  );

  return {
    allProjects: projects,
    currentProject: getCurrentProject(state),
    errors: state.get('errors').toJS(),
    runtimeErrors: state.get('runtimeErrors').toJS(),
    isUserTyping: state.getIn(['ui', 'editors', 'typing']),
    currentUser: state.get('user').toJS(),
    ui: state.get('ui').toJS(),
    clients: state.get('clients').toJS(),
  };
}

class Workspace extends React.Component {
  constructor() {
    super();
    bindAll(
      this,
      '_confirmUnload',
      '_handleClearRuntimeErrors',
      '_handleComponentMaximized',
      '_handleComponentMinimized',
      '_handleDashboardSubmenuToggled',
      '_handleEditorInput',
      '_handleErrorClick',
      '_handleLibraryToggled',
      '_handleLogOut',
      '_handleNewProject',
      '_handleProjectSelected',
      '_handleRuntimeError',
      '_handleStartLogIn',
      '_handleToggleDashboard',
      '_handleRequestedLineFocused',
      '_handleNotificationDismissed',
      '_handleExportGist',
    );
  }

  componentWillMount() {
    const query = location.search ?
      qs.parse(location.search.slice(1)) :
      {};
    history.replaceState({}, '', location.pathname);
    this.props.dispatch(bootstrap(query));
    this._listenForAuthChange();
    startSessionHeartbeat();
  }

  componentDidMount() {
    addEventListener('beforeunload', this._confirmUnload);
  }

  componentWillUnmount() {
    removeEventListener('beforeunload', this._confirmUnload);
  }

  _confirmUnload(event) {
    if (!this.props.currentUser.authenticated) {
      const currentProject = this.props.currentProject;
      if (!isNull(currentProject) && !isPristineProject(currentProject)) {
        event.returnValue = t('workspace.confirmations.unload-unsaved');
      }
    }
  }

  _allErrorsFor(language) {
    if (language === 'javascript') {
      return this.props.errors.javascript.items.
        concat(this.props.runtimeErrors);
    }

    return this.props.errors[language].items;
  }

  _handleComponentMinimized(componentName) {
    this.props.dispatch(minimizeComponent(componentName));
  }

  _handleComponentMaximized(componentName) {
    this.props.dispatch(maximizeComponent(componentName));
  }

  _handleErrorClick(language, line, column) {
    this.props.dispatch(maximizeComponent(`editor.${language}`));
    this.props.dispatch(userRequestedFocusedLine(language, line, column));
  }

  _handleEditorInput(language, source) {
    this.props.dispatch(userTyped());

    this.props.dispatch(
      updateProjectSource(
        this.props.currentProject.projectKey,
        language,
        source,
      ),
    );
  }

  _handleLibraryToggled(libraryKey) {
    this.props.dispatch(
      toggleLibrary(
        this.props.currentProject.projectKey,
        libraryKey,
      ),
    );
  }

  _handleNewProject() {
    this.props.dispatch(createProject());
  }

  _handleProjectSelected(project) {
    this.props.dispatch(changeCurrentProject(project.projectKey));
  }

  _handleDashboardSubmenuToggled(submenu) {
    this.props.dispatch(toggleDashboardSubmenu(submenu));
  }

  _handleRuntimeError(error) {
    this.props.dispatch(addRuntimeError(error));
  }

  _handleClearRuntimeErrors() {
    this.props.dispatch(clearRuntimeErrors());
  }

  _getOverallValidationState() {
    const errorStates = map(values(this.props.errors), 'state');

    if (includes(errorStates, 'failed')) {
      if (this.props.isUserTyping) {
        return 'validating';
      }
      return 'failed';
    }

    if (includes(errorStates, 'validating')) {
      return 'validating';
    }

    return 'passed';
  }

  _renderOutput() {
    return (
      <Output
        errors={this.props.errors}
        isHidden={includes(this.props.ui.minimizedComponents, 'output')}
        project={this.props.currentProject}
        runtimeErrors={this.props.runtimeErrors}
        validationState={this._getOverallValidationState()}
        onClearRuntimeErrors={this._handleClearRuntimeErrors}
        onErrorClick={this._handleErrorClick}
        onMinimize={
          partial(this._handleComponentMinimized,
            'output')
        }
        onRuntimeError={this._handleRuntimeError}
      />
    );
  }

  _renderEditors() {
    const editors = [];
    ['html', 'css', 'javascript'].forEach((language) => {
      if (includes(this.props.ui.minimizedComponents, `editor.${language}`)) {
        return;
      }

      editors.push(
        <EditorContainer
          key={language}
          language={language}
          source={this.props.currentProject.sources[language]}
          onMinimize={
            partial(this._handleComponentMinimized, `editor.${language}`)
          }
        >
          <Editor
            errors={this._allErrorsFor(language)}
            key={language}
            language={language}
            percentageOfHeight={1 / editors.length}
            projectKey={this.props.currentProject.projectKey}
            requestedFocusedLine={this.props.ui.editors.requestedFocusedLine}
            source={this.props.currentProject.sources[language]}
            onInput={partial(this._handleEditorInput, language)}
            onRequestedLineFocused={this._handleRequestedLineFocused}
          />
        </EditorContainer>,
      );
    });

    if (isEmpty(editors)) {
      return null;
    }

    return (
      <div className="environment__column editors">{editors}</div>
    );
  }

  _handleToggleDashboard() {
    this.props.dispatch(toggleDashboard());
  }

  _listenForAuthChange() {
    onSignedIn(({user, credential}) =>
      this.props.dispatch(logIn(user, credential)),
    );
    onSignedOut(() => this.props.dispatch(logOut()));
  }

  _handleStartLogIn() {
    signIn().catch((e) => {
      switch (e.code) {
        case 'auth/popup-closed-by-user':
          this.props.dispatch(notificationTriggered('user-cancelled-auth'));
          break;
        case 'auth/network-request-failed':
          this.props.dispatch(notificationTriggered('auth-network-error'));
          break;
        case 'auth/cancelled-popup-request':
          break;
        case 'auth/web-storage-unsupported':
          this.props.dispatch(
            notificationTriggered('auth-third-party-cookies-disabled'),
          );
          break;
        default:
          this.props.dispatch(notificationTriggered('auth-error'));
          if (isError(e)) {
            Bugsnag.notifyException(e, e.code);
          } else if (isString(e)) {
            Bugsnag.notifyException(new Error(e));
          }
          break;
      }
    });
  }

  _handleNotificationDismissed(error) {
    this.props.dispatch(userDismissedNotification(error.type));
  }

  _handleLogOut() {
    signOut();
  }

  _handleRequestedLineFocused() {
    this.props.dispatch(editorFocusedRequestedLine());
  }

  async _handleExportGist() {
    if (this.props.clients.gists.exportInProgress) {
      return;
    }

    if (!this.props.currentUser.authenticated) {
      // eslint-disable-next-line no-alert
      if (!confirm(t('workspace.confirmations.anonymous-gist-export'))) {
        return;
      }
    }

    const newWindow = openWindowWithWorkaroundForChromeClosingBug(
      `data:text/html;base64,${spinnerPage}`,
    );

    const gistWillExport = Gists.createFromProject(
      this.props.currentProject,
      this.props.currentUser,
    );
    this.props.dispatch(exportingGist(gistWillExport));

    try {
      const response = await gistWillExport;
      if (newWindow.closed) {
        this.props.dispatch(
          notificationTriggered(
            'gist-export-complete',
            'notice',
            {url: response.html_url},
          ),
        );
      } else {
        newWindow.location.href = response.html_url;
      }
    } catch (error) {
      if (error instanceof EmptyGistError) {
        this.props.dispatch(notificationTriggered('empty-gist'));
        if (!newWindow.closed) {
          newWindow.close();
        }
        return;
      }
      this.props.dispatch(notificationTriggered('gist-export-error'));
      if (!newWindow.closed) {
        newWindow.close();
      }
      throw error;
    }
  }

  _renderDashboard() {
    if (!this.props.ui.dashboard.isOpen) {
      return null;
    }

    return (
      <div className="layout__dashboard">
        <Dashboard
          activeSubmenu={this.props.ui.dashboard.activeSubmenu}
          allProjects={this.props.allProjects}
          currentProject={this.props.currentProject}
          currentUser={this.props.currentUser}
          gistExportInProgress={this.props.clients.gists.exportInProgress}
          validationState={this._getOverallValidationState()}
          onExportGist={this._handleExportGist}
          onLibraryToggled={this._handleLibraryToggled}
          onLogOut={this._handleLogOut}
          onNewProject={this._handleNewProject}
          onProjectSelected={this._handleProjectSelected}
          onStartLogIn={this._handleStartLogIn}
          onSubmenuToggled={this._handleDashboardSubmenuToggled}
        />
      </div>
    );
  }

  _renderSidebar() {
    return (
      <div className="layout__sidebar">
        <Sidebar
          dashboardIsOpen={this.props.ui.dashboard.isOpen}
          minimizedComponents={this.props.ui.minimizedComponents}
          validationState={this._getOverallValidationState()}
          onComponentMaximized={this._handleComponentMaximized}
          onToggleDashboard={this._handleToggleDashboard}
        />
      </div>
    );
  }

  _renderEnvironment() {
    if (isNull(this.props.currentProject)) {
      return <PopThrobber message={t('workspace.loading')} />;
    }

    return (
      <div className="environment">
        {this._renderEditors()}
        {this._renderOutput()}
      </div>
    );
  }

  render() {
    return (
      <div>
        <NotificationList
          notifications={this.props.ui.notifications}
          onErrorDismissed={this._handleNotificationDismissed}
        />
        <div className="layout">
          {this._renderDashboard()}
          {this._renderSidebar()}
          <div className="workspace layout__main">
            {this._renderEnvironment()}
          </div>
        </div>
      </div>
    );
  }
}

Workspace.propTypes = {
  allProjects: React.PropTypes.array.isRequired,
  clients: React.PropTypes.object.isRequired,
  currentProject: React.PropTypes.object,
  currentUser: React.PropTypes.object.isRequired,
  dispatch: React.PropTypes.func.isRequired,
  errors: React.PropTypes.object.isRequired,
  isUserTyping: React.PropTypes.bool,
  runtimeErrors: React.PropTypes.array.isRequired,
  ui: React.PropTypes.object.isRequired,
};

Workspace.defaultProps = {
  currentProject: null,
  isUserTyping: false,
};

export default connect(mapStateToProps)(Workspace);
