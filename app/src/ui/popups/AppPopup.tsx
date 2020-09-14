import * as React from 'react'
import { useCallback } from 'react'
import { Popup, PopupType } from '../../models/popup'
import { RenameBranch } from '../rename-branch'
import { DeleteBranch } from '../delete-branch'
import { DiscardChanges } from '../discard-changes'
import { DiscardSelection } from '../discard-changes/discard-selection-dialog'
import { Preferences } from '../preferences'
import { IDetachedHead, TipState } from '../../models/tip'
import { Merge } from '../merge-branch'
import { CherryPick } from '../cherry-pick'
import { CherryPickCommitList } from '../cherry-pick/cherry-pick-commit-list'
import { RepositorySettings } from '../repository-settings'
import { SignIn } from '../sign-in'
import { AddExistingRepository, CreateRepository } from '../add-repository'
import { CloneRepository } from '../clone-repository'
import { GitHubRepository } from '../../models/github-repository'
import { Branch } from '../../models/branch'
import { enableForkyCreateBranchUI } from '../../lib/feature-flag'
import { getNonForkGitHubRepository, isRepositoryWithGitHubRepository } from '../../models/repository'
import { findDefaultUpstreamBranch } from '../../lib/branch'
import { CreateBranch } from '../create-branch'
import {
  getUncommittedChangesStrategy,
  UncommittedChangesStrategyKind,
} from '../../models/uncommitted-changes-strategy'
import { InstallGit } from '../install-git'
import { getName, getVersion } from '../lib/app-proxy'
import { About } from '../about'
import { Publish } from '../publish-repository'
import { UntrustedCertificate } from '../untrusted-certificate'
import { Acknowledgements } from '../acknowledgements'
import { ConfirmRemoveRepository } from '../remove-repository'
import { TermsAndConditions } from '../terms-and-conditions'
import { PushBranchCommits } from '../branches'
import { CLIInstalled } from '../cli-installed'
import { GenericGitAuthentication } from '../generic-git-auth'
import { EditorError } from '../editor'
import { ShellError } from '../shell'
import { AttributeMismatch, InitializeLFS } from '../lfs'
import { UpstreamAlreadyExists } from '../upstream-already-exists'
import { ReleaseNotes } from '../release-notes'
import { DeletePullRequest } from '../delete-branch/delete-pull-request-dialog'
import { PossibleSelections, SelectionType } from '../../lib/app-state'
import { CommitConflictsWarning, MergeConflictsDialog } from '../merge-conflicts'
import { OversizedFiles } from '../changes/oversized-files-warning'
import { isConflictedFile } from '../../lib/status'
import { AbortMergeWarning } from '../abort-merge'
import { PushNeedsPullWarning } from '../push-needs-pull'
import { ConfirmForcePush, RebaseFlow } from '../rebase'
import { StashAndSwitchBranch } from '../stash-changes/stash-and-switch-branch-dialog'
import { WorkflowPushRejectedDialog } from '../workflow-push-rejected/workflow-push-rejected'
import { SAMLReauthRequiredDialog } from '../saml-reauth-required/saml-reauth-required'
import { CreateForkDialog } from '../forks/create-fork-dialog'
import { SChannelNoRevocationCheckDialog } from '../schannel-no-revocation-check/schannel-no-revocation-check'
import { CreateTag } from '../create-tag'
import { DeleteTag } from '../delete-tag'
import { ChooseForkSettings } from '../choose-fork-settings'
import { LocalChangesOverwrittenDialog } from '../local-changes-overwritten/local-changes-overwritten-dialog'
import { CheckoutToCommit } from './checkout-to-commit'
import { assertNever } from '../../lib/fatal-error'
import { Dispatcher } from '../dispatcher'
import { RepositoryStateCache } from '../../lib/stores/repository-state-cache'
import { Account } from '../../models/account'
import { ExternalEditor } from '../../lib/editors'
import { Shell } from '../../lib/shells'
import { ApplicationTheme } from '../lib/application-theme'
import { AppStore, SignInState } from '../../lib/stores'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { IAccountRepositories } from '../../lib/stores/api-repositories-store'
import { CommitMessagePopup } from './commit-message'

interface IProps {
  readonly appStore: AppStore
  readonly popup: Popup | null
  readonly dispatcher: Dispatcher
  readonly repositoryStateManager: RepositoryStateCache
  /** Whether we should show a confirmation dialog */
  readonly askForConfirmationOnDiscardChanges: boolean
  /** Whether we should show a confirmation dialog */
  readonly askForConfirmationOnRepositoryRemoval: boolean
  /** Should the app prompt the user to confirm a force push? */
  readonly askForConfirmationOnForcePush: boolean
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  /** How the app should handle uncommitted changes when switching branches */
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
  /** The external editor to use when opening repositories */
  readonly selectedExternalEditor: ExternalEditor | null
  /** The user's preferred shell. */
  readonly selectedShell: Shell,
  /** The currently selected appearance (aka theme) */
  readonly selectedTheme: ApplicationTheme
  /** Whether we should automatically change the currently selected appearance (aka theme) */
  readonly automaticallySwitchTheme: boolean
  /**
   * The state of the ongoing (if any) sign in process. See SignInState
   * and SignInStore for more details. Null if no current sign in flow
   * is active. Sign in flows are initiated through the dispatcher methods
   * beginDotComSignIn and beginEnterpriseSign in or via the
   * showDotcomSignInDialog and showEnterpriseSignInDialog methods.
   */
  readonly signInState: SignInState | null
  /** The currently selected tab for Clone Repository. */
  readonly selectedCloneRepositoryTab: CloneRepositoryTab
  /**
   * A map keyed on a user account (GitHub.com or GitHub Enterprise)
   * containing an object with repositories that the authenticated
   * user has explicit permission (:read, :write, or :admin) to access
   * as well as information about whether the list of repositories
   * is currently being loaded or not.
   *
   * If a currently signed in account is missing from the map that
   * means that the list of accessible repositories has not yet been
   * loaded. An entry for an account with an empty list of repositories
   * means that no accessible repositories was found for the account.
   *
   * See the ApiRepositoriesStore for more details on loading repositories
   */
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>
  readonly selectedState: PossibleSelections | null
  /**
   * A cached entry representing an external editor found on the user's machine:
   *
   *  - If the `selectedExternalEditor` can be found, choose that
   *  - Otherwise, if any editors found, this will be set to the first value
   *    based on the search order in `app/src/lib/editors/{platform}.ts`
   *  - If no editors found, this will remain `null`
   */
  readonly resolvedExternalEditor: ExternalEditor | null
}

export const AppPopup: React.FC<IProps> = (
  {
    popup,
    dispatcher,
    askForConfirmationOnDiscardChanges,
    askForConfirmationOnRepositoryRemoval,
    askForConfirmationOnForcePush,
    dotComAccount,
    enterpriseAccount,
    uncommittedChangesStrategyKind,
    selectedExternalEditor,
    selectedShell,
    selectedTheme,
    automaticallySwitchTheme,
    repositoryStateManager,
    signInState,
    selectedCloneRepositoryTab,
    apiRepositories,
    selectedState,
    resolvedExternalEditor,
    appStore
  }) => {

  if (!popup) {
    return null
  }

  const onPopupDismissedFn = useCallback(() => {
    dispatcher.closePopup(popup.type)
  }, [popup.type])

  switch (popup.type) {
    case PopupType.RenameBranch:
      const stash = null
      return (
        <RenameBranch
          key="rename-branch"
          dispatcher={dispatcher}
          repository={popup.repository}
          branch={popup.branch}
          stash={stash}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.DeleteBranch:
      return (
        <DeleteBranch
          key="delete-branch"
          dispatcher={dispatcher}
          repository={popup.repository}
          branch={popup.branch}
          existsOnRemote={popup.existsOnRemote}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.ConfirmDiscardChanges:
      const showSetting =
        popup.showDiscardChangesSetting === undefined
          ? true
          : popup.showDiscardChangesSetting
      const discardingAllChanges =
        popup.discardingAllChanges === undefined
          ? false
          : popup.discardingAllChanges

      return (
        <DiscardChanges
          key="discard-changes"
          repository={popup.repository}
          dispatcher={dispatcher}
          files={popup.files}
          confirmDiscardChanges={askForConfirmationOnDiscardChanges}
          showDiscardChangesSetting={showSetting}
          discardingAllChanges={discardingAllChanges}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.ConfirmDiscardSelection:
      return (
        <DiscardSelection
          key="discard-selection"
          repository={popup.repository}
          dispatcher={dispatcher}
          file={popup.file}
          diff={popup.diff}
          selection={popup.selection}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.Preferences:
      return (
        <Preferences
          key="preferences"
          initialSelectedTab={popup.initialSelectedTab}
          dispatcher={dispatcher}
          dotComAccount={dotComAccount}
          confirmRepositoryRemoval={askForConfirmationOnRepositoryRemoval}
          confirmDiscardChanges={askForConfirmationOnDiscardChanges}
          confirmForcePush={askForConfirmationOnForcePush}
          uncommittedChangesStrategyKind={uncommittedChangesStrategyKind}
          selectedExternalEditor={selectedExternalEditor}
          enterpriseAccount={enterpriseAccount}
          onDismissed={onPopupDismissedFn}
          selectedShell={selectedShell}
          selectedTheme={selectedTheme}
          automaticallySwitchTheme={automaticallySwitchTheme}
        />
      )
    case PopupType.MergeBranch: {
      const { repository, branch } = popup
      const state = repositoryStateManager.get(repository)

      const tip = state.branchesState.tip

      // we should never get in this state since we disable the menu
      // item in a detatched HEAD state, this check is so TSC is happy
      if (tip.kind !== TipState.Valid) {
        return null
      }

      const currentBranch = tip.branch

      return (
        <Merge
          key="merge-branch"
          dispatcher={dispatcher}
          repository={repository}
          allBranches={state.branchesState.allBranches}
          defaultBranch={state.branchesState.defaultBranch}
          recentBranches={state.branchesState.recentBranches}
          currentBranch={currentBranch}
          initialBranch={branch}
          onDismissed={onPopupDismissedFn}
        />
      )
    }

    case PopupType.CherryPick: {
      const { repository, branch } = popup
      const state = repositoryStateManager.get(repository)

      const tip = state.branchesState.tip

      // we should never get in this state since we disable the menu
      // item in a detatched HEAD state, this check is so TSC is happy
      if (tip.kind !== TipState.Valid) {
        return null
      }

      const currentBranch = tip.branch

      return (
        <CherryPick
          key="cherry-pick-branch"
          dispatcher={dispatcher}
          repository={repository}
          allBranches={state.branchesState.allBranches}
          defaultBranch={state.branchesState.defaultBranch}
          recentBranches={state.branchesState.recentBranches}
          currentBranch={currentBranch}
          initialBranch={branch}
          onDismissed={onPopupDismissedFn}
        />
      )
    }
    case PopupType.CherryPickCommitList: {
      const { repository, branch } = popup
      const state = repositoryStateManager.get(repository)

      const tip = state.branchesState.tip

      // we should never get in this state since we disable the menu
      // item in a detatched HEAD state, this check is so TSC is happy
      if (tip.kind !== TipState.Valid) {
        return null
      }

      const currentBranch = tip.branch
      return (
        <CherryPickCommitList
          key="cherry-pick-branch-commit-list"
          selectedBranch={branch}
          repository={repository}
          gitHubRepository={repository.gitHubRepository}
          currentBranch={currentBranch}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
        />
      )
    }

    case PopupType.RepositorySettings: {
      const repository = popup.repository
      const state = repositoryStateManager.get(repository)

      return (
        <RepositorySettings
          key={`repository-settings-${repository.hash}`}
          remote={state.remote}
          dispatcher={dispatcher}
          repository={repository}
          onDismissed={onPopupDismissedFn}
        />
      )
    }
    case PopupType.SignIn:
      return (
        <SignIn
          key="sign-in"
          signInState={signInState}
          dispatcher={dispatcher}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.AddRepository:
      return (
        <AddExistingRepository
          key="add-existing-repository"
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          path={popup.path}
        />
      )
    case PopupType.CreateRepository:
      return (
        <CreateRepository
          key="create-repository"
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          initialPath={popup.path}
        />
      )
    case PopupType.CloneRepository:
      return (
        <CloneRepository
          key="clone-repository"
          dotComAccount={dotComAccount}
          enterpriseAccount={enterpriseAccount}
          initialURL={popup.initialURL}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          selectedTab={selectedCloneRepositoryTab}
          apiRepositories={apiRepositories}
        />
      )
    case PopupType.CreateBranchFromCommit:
      const state = repositoryStateManager.get(popup.repository)
      const branchesState = state.branchesState
      const currentBranchProtected = state.changesState.currentBranchProtected
      const repository = popup.repository

      if (branchesState.tip.kind === TipState.Unknown) {
        onPopupDismissedFn()
        return null
      }

      let upstreamGhRepo: GitHubRepository | null = null
      let upstreamDefaultBranch: Branch | null = null

      if (
        enableForkyCreateBranchUI() &&
        isRepositoryWithGitHubRepository(repository)
      ) {
        upstreamGhRepo = getNonForkGitHubRepository(repository)
        upstreamDefaultBranch = findDefaultUpstreamBranch(
          repository,
          branchesState.allBranches,
        )
      }

      const detachedTip: IDetachedHead = {
        kind: TipState.Detached,
        currentSha: popup.commitSha,
      }

      return (
        <CreateBranch
          key="create-branch"
          tip={detachedTip}
          defaultBranch={branchesState.defaultBranch}
          upstreamDefaultBranch={upstreamDefaultBranch}
          allBranches={branchesState.allBranches}
          repository={repository}
          upstreamGitHubRepository={upstreamGhRepo}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          initialName={''}
          currentBranchProtected={currentBranchProtected}
          selectedUncommittedChangesStrategy={getUncommittedChangesStrategy(
            uncommittedChangesStrategyKind,
          )}
        />
      )
    case PopupType.CreateBranch: {
      const state = repositoryStateManager.get(popup.repository)
      const branchesState = state.branchesState
      const currentBranchProtected = state.changesState.currentBranchProtected
      const repository = popup.repository

      if (branchesState.tip.kind === TipState.Unknown) {
        onPopupDismissedFn()
        return null
      }

      let upstreamGhRepo: GitHubRepository | null = null
      let upstreamDefaultBranch: Branch | null = null

      if (
        enableForkyCreateBranchUI() &&
        isRepositoryWithGitHubRepository(repository)
      ) {
        upstreamGhRepo = getNonForkGitHubRepository(repository)
        upstreamDefaultBranch = findDefaultUpstreamBranch(
          repository,
          branchesState.allBranches,
        )
      }

      return (
        <CreateBranch
          key="create-branch"
          tip={branchesState.tip}
          defaultBranch={branchesState.defaultBranch}
          upstreamDefaultBranch={upstreamDefaultBranch}
          allBranches={branchesState.allBranches}
          repository={repository}
          upstreamGitHubRepository={upstreamGhRepo}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          initialName={popup.initialName || ''}
          currentBranchProtected={currentBranchProtected}
          selectedUncommittedChangesStrategy={getUncommittedChangesStrategy(
            uncommittedChangesStrategyKind,
          )}
        />
      )
    }
    case PopupType.InstallGit:
      return (
        <InstallGit
          key="install-git"
          onDismissed={onPopupDismissedFn}
          path={popup.path}
        />
      )
    case PopupType.About:
      const version = __DEV__ ? __SHA__.substr(0, 10) : getVersion()

      return (
        <About
          key="about"
          onDismissed={onPopupDismissedFn}
          applicationName={getName()}
          applicationVersion={version}
        />
      )
    case PopupType.PublishRepository:
      return (
        <Publish
          key="publish"
          dispatcher={dispatcher}
          repository={popup.repository}
          dotComAccount={dotComAccount}
          enterpriseAccount={enterpriseAccount}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.UntrustedCertificate:
      return (
        <UntrustedCertificate
          key="untrusted-certificate"
          certificate={popup.certificate}
          url={popup.url}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.Acknowledgements:
      return (
        <Acknowledgements
          key="acknowledgements"
          onDismissed={onPopupDismissedFn}
          applicationVersion={getVersion()}
        />
      )
    case PopupType.RemoveRepository:
      return (
        <ConfirmRemoveRepository
          key="confirm-remove-repository"
          repository={popup.repository}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.TermsAndConditions:
      return (
        <TermsAndConditions
          key="terms-and-conditions"
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.PushBranchCommits:
      return (
        <PushBranchCommits
          key="push-branch-commits"
          dispatcher={dispatcher}
          repository={popup.repository}
          branch={popup.branch}
          unPushedCommits={popup.unPushedCommits}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.CLIInstalled:
      return (
        <CLIInstalled key="cli-installed" onDismissed={onPopupDismissedFn} />
      )
    case PopupType.GenericGitAuthentication:
      return (
        <GenericGitAuthentication
          key="generic-git-authentication"
          hostname={popup.hostname}
          onDismiss={onPopupDismissedFn}
          retryAction={popup.retryAction}
        />
      )
    case PopupType.ExternalEditorFailed:
      const openPreferences = popup.openPreferences
      const suggestAtom = popup.suggestAtom

      return (
        <EditorError
          key="editor-error"
          message={popup.message}
          onDismissed={onPopupDismissedFn}
          viewPreferences={openPreferences}
          suggestAtom={suggestAtom}
        />
      )
    case PopupType.OpenShellFailed:
      return (
        <ShellError
          key="shell-error"
          message={popup.message}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.InitializeLFS:
      return (
        <InitializeLFS
          key="initialize-lfs"
          repositories={popup.repositories}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.LFSAttributeMismatch:
      return (
        <AttributeMismatch
          key="lsf-attribute-mismatch"
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.UpstreamAlreadyExists:
      return (
        <UpstreamAlreadyExists
          key="upstream-already-exists"
          repository={popup.repository}
          existingRemote={popup.existingRemote}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.ReleaseNotes:
      return (
        <ReleaseNotes
          key="release-notes"
          newRelease={popup.newRelease}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.DeletePullRequest:
      return (
        <DeletePullRequest
          key="delete-pull-request"
          dispatcher={dispatcher}
          repository={popup.repository}
          branch={popup.branch}
          onDismissed={onPopupDismissedFn}
          pullRequest={popup.pullRequest}
        />
      )
    case PopupType.MergeConflicts: {
      if (
        selectedState === null ||
        selectedState.type !== SelectionType.Repository
      ) {
        return null
      }

      const {
        workingDirectory,
        conflictState,
      } = selectedState.state.changesState

      if (conflictState === null || conflictState.kind === 'rebase') {
        return null
      }

      return (
        <MergeConflictsDialog
          key="merge-conflicts-dialog"
          dispatcher={dispatcher}
          repository={popup.repository}
          workingDirectory={workingDirectory}
          onDismissed={onPopupDismissedFn}
          resolvedExternalEditor={resolvedExternalEditor}
          ourBranch={popup.ourBranch}
          theirBranch={popup.theirBranch}
          manualResolutions={conflictState.manualResolutions}
        />
      )
    }
    case PopupType.OversizedFiles:
      return (
        <OversizedFiles
          key="oversized-files"
          oversizedFiles={popup.oversizedFiles}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          context={popup.context}
          repository={popup.repository}
        />
      )
    case PopupType.AbortMerge: {
      if (
        selectedState === null ||
        selectedState.type !== SelectionType.Repository
      ) {
        return null
      }
      const { workingDirectory } = selectedState.state.changesState
      // double check that this repository is actually in merge
      const isInConflictedMerge = workingDirectory.files.some(file =>
        isConflictedFile(file.status),
      )
      if (!isInConflictedMerge) {
        return null
      }

      return (
        <AbortMergeWarning
          key="abort-merge-warning"
          dispatcher={dispatcher}
          repository={popup.repository}
          onDismissed={onPopupDismissedFn}
          ourBranch={popup.ourBranch}
          theirBranch={popup.theirBranch}
        />
      )
    }
    case PopupType.CommitConflictsWarning:
      return (
        <CommitConflictsWarning
          key="commit-conflicts-warning"
          dispatcher={dispatcher}
          files={popup.files}
          repository={popup.repository}
          context={popup.context}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.PushNeedsPull:
      return (
        <PushNeedsPullWarning
          key="push-needs-pull"
          dispatcher={dispatcher}
          repository={popup.repository}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.RebaseFlow: {

      if (
        selectedState === null ||
        selectedState.type !== SelectionType.Repository
      ) {
        return null
      }

      const { changesState, rebaseState } = selectedState.state
      const { workingDirectory, conflictState } = changesState
      const { progress, step, userHasResolvedConflicts } = rebaseState

      if (conflictState !== null && conflictState.kind === 'merge') {
        log.warn(
          '[App] invalid state encountered - rebase flow should not be used when merge conflicts found',
        )
        return null
      }

      if (step === null) {
        log.warn(
          '[App] invalid state encountered - rebase flow should not be active when step is null',
        )
        return null
      }

      return (
        <RebaseFlow
          key="rebase-flow"
          repository={popup.repository}
          dispatcher={dispatcher}
          onDismissed={onPopupDismissedFn}
          workingDirectory={workingDirectory}
          progress={progress}
          step={step}
          userHasResolvedConflicts={userHasResolvedConflicts}
          askForConfirmationOnForcePush={askForConfirmationOnForcePush}
          resolvedExternalEditor={resolvedExternalEditor}
        />
      )
    }
    case PopupType.ConfirmForcePush: {

      return (
        <ConfirmForcePush
          key="confirm-force-push"
          dispatcher={dispatcher}
          repository={popup.repository}
          upstreamBranch={popup.upstreamBranch}
          askForConfirmationOnForcePush={askForConfirmationOnForcePush}
          onDismissed={onPopupDismissedFn}
        />
      )
    }
    case PopupType.StashAndSwitchBranch: {
      const { repository, branchToCheckout } = popup
      const {
        branchesState,
      } = repositoryStateManager.get(repository)
      const { tip } = branchesState

      let currentBranch: Branch | null = null
      if (tip.kind === TipState.Valid) {
        currentBranch = tip.branch
      }

      return (
        <StashAndSwitchBranch
          key="stash-and-switch-branch"
          dispatcher={dispatcher}
          repository={popup.repository}
          currentBranch={currentBranch}
          branchToCheckout={branchToCheckout}
          onDismissed={onPopupDismissedFn}
          isValidBranch={tip.kind === TipState.Valid}
        />
      )
    }
    case PopupType.PushRejectedDueToMissingWorkflowScope:
      return (
        <WorkflowPushRejectedDialog
          onDismissed={onPopupDismissedFn}
          rejectedPath={popup.rejectedPath}
          dispatcher={dispatcher}
          repository={popup.repository}
        />
      )
    case PopupType.SAMLReauthRequired:
      return (
        <SAMLReauthRequiredDialog
          onDismissed={onPopupDismissedFn}
          organizationName={popup.organizationName}
          endpoint={popup.endpoint}
          retryAction={popup.retryAction}
          dispatcher={dispatcher}
        />
      )
    case PopupType.CreateFork:
      return (
        <CreateForkDialog
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          repository={popup.repository}
          account={popup.account}
        />
      )
    case PopupType.SChannelNoRevocationCheck:
      return (
        <SChannelNoRevocationCheckDialog
          onDismissed={onPopupDismissedFn}
          url={popup.url}
        />
      )
    case PopupType.CreateTag: {
      return (
        <CreateTag
          key="create-tag"
          repository={popup.repository}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          targetCommitSha={popup.targetCommitSha}
          initialName={popup.initialName}
          localTags={popup.localTags}
        />
      )
    }
    case PopupType.DeleteTag: {
      return (
        <DeleteTag
          key="delete-tag"
          repository={popup.repository}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
          tagName={popup.tagName}
        />
      )
    }
    case PopupType.ChooseForkSettings: {
      return (
        <ChooseForkSettings
          repository={popup.repository}
          onDismissed={onPopupDismissedFn}
          dispatcher={dispatcher}
        />
      )
    }
    case PopupType.LocalChangesOverwritten:
      return (
        <LocalChangesOverwrittenDialog
          repository={popup.repository}
          dispatcher={dispatcher}
          retryAction={popup.retryAction}
          onDismissed={onPopupDismissedFn}
        />
      )
    case PopupType.CheckoutToTag:
      return <CheckoutToCommit
        dispatcher={dispatcher}
        repository={popup.repository}
        commit={`tags/${popup.tagName}`}
        onDismissed={onPopupDismissedFn}
      />
    case PopupType.CheckoutToCommit:
      return <CheckoutToCommit
        dispatcher={dispatcher}
        repository={popup.repository}
        commit={popup.commitSha}
        onDismissed={onPopupDismissedFn}
      />
    case PopupType.Commit:
      const lastCommit = appStore.getLastCommit(popup.repository)
      const rebaseConflictState = appStore.getRebaseConflictState(popup.repository)
      const workingDirectory = appStore.getWorkingDirectory(popup.repository)
      const isCurrentBranchProtected = appStore.isCurrentBranchProtected(popup.repository)
      const commitAuthor = appStore.getCommitAuthor(popup.repository)
      const commitMessage = appStore.getCommitMessage(popup.repository)
      const mostRecentLocalCommit = appStore.getMostRecentCommit(popup.repository)
      const focusCommitMessage = appStore.getFocusCommitMessage()

      const tip = appStore.branchState(popup.repository).tip
      let branchName: string | null = null
      if (tip.kind === TipState.Valid) {
        branchName = tip.branch.name
      } else if (tip.kind === TipState.Unborn) {
        branchName = tip.ref
      }
      return <CommitMessagePopup
        onDismissed={onPopupDismissedFn}
        rebaseConflictState={rebaseConflictState}
        isCommitting={false}
        workingDirectory={workingDirectory}
        repository={popup.repository}
        currentBranchProtected={isCurrentBranchProtected}
        lastCommit={lastCommit}
        mostRecentLocalCommit={mostRecentLocalCommit}
        branch={branchName}
        commitAuthor={commitAuthor}
        commitMessage={commitMessage}
        focusCommitMessage={focusCommitMessage}
      />
    default:
      return assertNever(popup, `Unknown popup type: ${popup}`)
  }


}