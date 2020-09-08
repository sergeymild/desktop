import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Repository } from '../../models/repository'
import { MenuIDs } from '../../models/menu-ids'
import { IMenu, MenuItem } from '../../models/app-menu'
import memoizeOne from 'memoize-one'
import { getPlatformSpecificNameOrSymbolForModifier } from '../../lib/menu-item'
import { MenuBackedSuggestedAction } from '../suggested-actions'
import { IRepositoryState } from '../../lib/app-state'
import { TipState, IValidBranch } from '../../models/tip'
import { Ref } from '../lib/ref'
import { Branch, IAheadBehind } from '../../models/branch'
import { IRemote } from '../../models/remote'
import { isCurrentBranchForcePush } from '../../lib/rebase'
import { SuggestedActionGroup } from '../suggested-actions'
import { PopupType } from '../../models/popup'
import { dispatcher } from '../index'

function formatMenuItemLabel(text: string) {
  if (__WIN32__ || __LINUX__) {
    // Ampersand has a special meaning on Windows where it denotes
    // the access key (usually rendered as an underline on the following)
    // character. A literal ampersand is escaped by putting another ampersand
    // in front of it (&&). Here we strip single ampersands and unescape
    // double ampersands. Example: "&Push && Pull" becomes "Push & Pull".
    return text.replace(/&?&/g, m => (m.length > 1 ? '&' : ''))
  }

  return text
}

function formatParentMenuLabel(menuItem: IMenuItemInfo) {
  const parentMenusText = menuItem.parentMenuLabels.join(' -> ')
  return formatMenuItemLabel(parentMenusText)
}

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

interface INoChangesProps {
  /**
   * The currently selected repository
   */
  readonly repository: Repository

  /**
   * The top-level application menu item.
   */
  readonly appMenu: IMenu | undefined

  /**
   * An object describing the current state of
   * the selected repository. Used to determine
   * whether to render push, pull, publish, or
   * 'open pr' actions.
   */
  readonly repositoryState: IRepositoryState

  /**
   * Whether or not the user has a configured (explicitly,
   * or automatically) external editor. Used to
   * determine whether or not to render the action for
   * opening the repository in an external editor.
   */
  readonly isExternalEditorAvailable: boolean
}

/**
 * Helper projection interface used to hold
 * computed information about a particular menu item.
 * Used internally in the NoChanges component to
 * trace whether a menu item is enabled, what its
 * keyboard shortcut is and so forth.
 */
interface IMenuItemInfo {
  /**
   * The textual representation of the menu item,
   * this is what's shown in the application menu
   */
  readonly label: string

  /**
   * Any accelerator keys (i.e. keyboard shortcut)
   * for the menu item. A menu item which can be
   * triggered using Command+Shift+K would be
   * represented here as three elements in the
   * array. Used to format and display the keyboard
   * shortcut for activating an action.
   */
  readonly acceleratorKeys: ReadonlyArray<string>

  /**
   * An ordered list of the labels for parent menus
   * of a particular menu item. Used to provide
   * a textual representation of where to locate
   * a particular action in the menu system.
   */
  readonly parentMenuLabels: ReadonlyArray<string>

  /**
   * Whether or not the menu item is currently
   * enabled.
   */
  readonly enabled: boolean
}

interface INoChangesState {
  /**
   * Whether or not to enable the slide in and
   * slide out transitions for the remote actions.
   *
   * Disabled initially and enabled 500ms after
   * component mounting in order to provide instant
   * loading of the remote action when the view is
   * initially appearing.
   */
  readonly enableTransitions: boolean
}

function getItemAcceleratorKeys(item: MenuItem) {
  if (item.type === 'separator' || item.type === 'submenuItem') {
    return []
  }

  if (item.accelerator === null) {
    return []
  }

  return item.accelerator
    .split('+')
    .map(getPlatformSpecificNameOrSymbolForModifier)
}

function buildMenuItemInfoMap(
  menu: IMenu,
  map = new Map<string, IMenuItemInfo>(),
  parent?: IMenuItemInfo
): ReadonlyMap<string, IMenuItemInfo> {
  for (const item of menu.items) {
    if (item.type === 'separator') {
      continue
    }

    const infoItem: IMenuItemInfo = {
      label: item.label,
      acceleratorKeys: getItemAcceleratorKeys(item),
      parentMenuLabels:
        parent === undefined ? [] : [parent.label, ...parent.parentMenuLabels],
      enabled: item.enabled,
    }

    map.set(item.id, infoItem)

    if (item.type === 'submenuItem') {
      buildMenuItemInfoMap(item.menu, map, infoItem)
    }
  }

  return map
}

/** The component to display when there are no local changes. */
export class NoChanges extends React.PureComponent<
  INoChangesProps,
  INoChangesState
> {
  private getMenuInfoMap = memoizeOne((menu: IMenu | undefined) =>
    menu === undefined
      ? new Map<string, IMenuItemInfo>()
      : buildMenuItemInfoMap(menu)
  )

  /**
   * ID for the timer that's activated when the component
   * mounts. See componentDidMount/componenWillUnmount.
   */
  private transitionTimer: number | null = null

  public constructor(props: INoChangesProps) {
    super(props)
    this.state = {
      enableTransitions: false,
    }
  }

  private getMenuItemInfo(menuItemId: MenuIDs): IMenuItemInfo | undefined {
    return this.getMenuInfoMap(this.props.appMenu).get(menuItemId)
  }

  private renderDiscoverabilityElements(menuItem: IMenuItemInfo) {
    const parentMenusText = formatParentMenuLabel(menuItem)

    return (
      <>
        {parentMenusText} menu or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )
  }

  private renderDiscoverabilityKeyboardShortcut(menuItem: IMenuItemInfo) {
    return menuItem.acceleratorKeys.map((k, i) => <kbd key={k + i}>{k}</kbd>)
  }

  private currentBranch = (): Branch | null => {
    const {
      branchesState,
    } = this.props.repositoryState
    const { tip } = branchesState

    if (tip.kind !== TipState.Valid) {
      return null
    }

    return (tip as IValidBranch).branch
  }

  private onMergeIntoClick = () => {
    dispatcher.showPopup({
      type: PopupType.MergeBranch,
      repository: this.props.repository,
    })
  }

  private renderMergeInto() {
    const branch = this.currentBranch()
    if (!branch) { return }

    return (
      <MenuBackedSuggestedAction
        title={`Merge branches into ${branch.name}`}
        discoverabilityContent={"Select branches witch merge"}
        menuItemId="merge-branch"
        buttonText={formatMenuItemLabel(`Choose`)}
        disabled={false}
        onClick={this.onMergeIntoClick}
      />
    )
  }

  private onCherryPickInto = () => {
    dispatcher.showPopup({
      type: PopupType.CherryPick,
      repository: this.props.repository,
    })
  }

  private renderCherryPickInto() {
    const branch = this.currentBranch()
    if (!branch) { return }

    return (
      <MenuBackedSuggestedAction
        title={`Cherry pick branches into ${branch.name}`}
        discoverabilityContent={"Select branches witch you cherry pick"}
        menuItemId="cherry-pick-branch"
        buttonText={formatMenuItemLabel(`Choose`)}
        disabled={false}
        onClick={this.onCherryPickInto}
      />
    )
  }

  private renderRemoteAction() {
    const {
      remote,
      aheadBehind,
      branchesState,
      tagsToPush,
    } = this.props.repositoryState
    const { tip, defaultBranch, currentPullRequest } = branchesState

    if (tip.kind !== TipState.Valid) {
      return null
    }

    if (remote === null) {
      return this.renderPublishRepositoryAction()
    }

    // Branch not published
    if (aheadBehind === null) {
      return this.renderPublishBranchAction(tip)
    }

    const isForcePush = isCurrentBranchForcePush(branchesState, aheadBehind)
    if (isForcePush) {
      // do not render an action currently after the rebase has completed, as
      // the default behaviour is currently to pull in changes from the tracking
      // branch which will could potentially lead to a more confusing history
      return null
    }

    if (aheadBehind.behind > 0) {
      return this.renderPullBranchAction(tip, remote, aheadBehind)
    }

    if (
      aheadBehind.ahead > 0 ||
      (tagsToPush !== null && tagsToPush.length > 0)
    ) {
      return this.renderPushBranchAction(tip, remote, aheadBehind, tagsToPush)
    }

    const isGitHub = this.props.repository.gitHubRepository !== null
    const hasOpenPullRequest = currentPullRequest !== null
    const isDefaultBranch =
      defaultBranch !== null && tip.branch.name === defaultBranch.name

    if (isGitHub && !hasOpenPullRequest && !isDefaultBranch) {
      return this.renderCreatePullRequestAction(tip)
    }

    return null
  }

  private renderPublishRepositoryAction() {
    // This is a bit confusing, there's no dedicated
    // publish menu item, the 'Push' menu item will initiate
    // a publish if the repository doesn't have a remote. We'll
    // use it here for the keyboard shortcut only.
    const itemId: MenuIDs = 'push'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const discoverabilityContent = (
      <>
        Always available in the toolbar for local repositories or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    return (
      <MenuBackedSuggestedAction
        key="publish-repository-action"
        title="Publish your repository to GitHub"
        description="This repository is currently only available on your local machine. By publishing it on GitHub you can share it, and collaborate with others."
        discoverabilityContent={discoverabilityContent}
        buttonText="Publish repository"
        menuItemId={itemId}
        type="primary"
        disabled={!menuItem.enabled}
        onClick={this.onPublishRepositoryClicked}
      />
    )
  }

  private onPublishRepositoryClicked = () =>
    dispatcher.recordSuggestedStepPublishRepository()

  private renderPublishBranchAction(tip: IValidBranch) {
    // This is a bit confusing, there's no dedicated
    // publish branch menu item, the 'Push' menu item will initiate
    // a publish if the branch doesn't have a remote tracking branch.
    // We'll use it here for the keyboard shortcut only.
    const itemId: MenuIDs = 'push'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const isGitHub = this.props.repository.gitHubRepository !== null

    const description = (
      <>
        The current branch (<Ref>{tip.branch.name}</Ref>) hasn't been published
        to the remote yet. By publishing it {isGitHub ? 'to GitHub' : ''} you
        can share it, {isGitHub ? 'open a pull request, ' : ''}
        and collaborate with others.
      </>
    )

    const discoverabilityContent = (
      <>
        Always available in the toolbar or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    return (
      <MenuBackedSuggestedAction
        key="publish-branch-action"
        title="Publish your branch"
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText="Publish branch"
        type="primary"
        disabled={!menuItem.enabled}
        onClick={this.onPublishBranchClicked}
      />
    )
  }

  private onPublishBranchClicked = () =>
    dispatcher.recordSuggestedStepPublishBranch()

  private renderPullBranchAction(
    tip: IValidBranch,
    remote: IRemote,
    aheadBehind: IAheadBehind
  ) {
    const itemId: MenuIDs = 'pull'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const isGitHub = this.props.repository.gitHubRepository !== null

    const description = (
      <>
        The current branch (<Ref>{tip.branch.name}</Ref>) has{' '}
        {aheadBehind.behind === 1 ? 'a commit' : 'commits'} on{' '}
        {isGitHub ? 'GitHub' : 'the remote'} that{' '}
        {aheadBehind.behind === 1 ? 'does not' : 'do not'} exist on your
        machine.
      </>
    )

    const discoverabilityContent = (
      <>
        Always available in the toolbar when there are remote changes or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    const title = `Pull ${aheadBehind.behind} ${
      aheadBehind.behind === 1 ? 'commit' : 'commits'
    } from the ${remote.name} remote`

    const buttonText = `Pull ${remote.name}`

    return (
      <MenuBackedSuggestedAction
        key="pull-branch-action"
        title={title}
        menuItemId={itemId}

        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText={buttonText}
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderPushBranchAction(
    tip: IValidBranch,
    remote: IRemote,
    aheadBehind: IAheadBehind,
    tagsToPush: ReadonlyArray<string> | null
  ) {    const itemId: MenuIDs = 'push'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const isGitHub = this.props.repository.gitHubRepository !== null

    const itemsToPushTypes = []
    const itemsToPushDescriptions = []

    if (aheadBehind.ahead > 0) {
      itemsToPushTypes.push('commits')
      itemsToPushDescriptions.push(
        aheadBehind.ahead === 1
          ? '1 local commit'
          : `${aheadBehind.ahead} local commits`
      )
    }

    if (tagsToPush !== null && tagsToPush.length > 0) {
      itemsToPushTypes.push('tags')
      itemsToPushDescriptions.push(
        tagsToPush.length === 1 ? '1 tag' : `${tagsToPush.length} tags`
      )
    }

    const description = `You have ${itemsToPushDescriptions.join(
      ' and '
    )} waiting to be pushed to ${isGitHub ? 'GitHub' : 'the remote'}.`

    const discoverabilityContent = (
      <>
        Always available in the toolbar when there are local commits waiting to
        be pushed or {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    const title = `Push ${itemsToPushTypes.join(' and ')} to the ${
      remote.name
    } remote`

    const buttonText = `Push ${remote.name}`

    return (
      <MenuBackedSuggestedAction
        key="push-branch-action"
        title={title}
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText={buttonText}
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderCreatePullRequestAction(tip: IValidBranch) {
    const itemId: MenuIDs = 'create-pull-request'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const description = (
      <>
        The current branch (<Ref>{tip.branch.name}</Ref>) is already published
        to GitHub. Create a pull request to propose and collaborate on your
        changes.
      </>
    )

    const title = `Create a Pull Request from your current branch`
    const buttonText = `Create Pull Request`

    return (
      <MenuBackedSuggestedAction
        key="create-pr-action"
        title={title}
        menuItemId={itemId}
        description={description}
        buttonText={buttonText}
        discoverabilityContent={this.renderDiscoverabilityElements(menuItem)}
        type="primary"
        disabled={!menuItem.enabled}
        onClick={this.onCreatePullRequestClicked}
      />
    )
  }

  private onCreatePullRequestClicked = () =>
    dispatcher.recordSuggestedStepCreatePullRequest()

  private renderActions() {
    return (
      <>
        <SuggestedActionGroup
          type="primary"
          transitions={'replace'}
          enableTransitions={this.state.enableTransitions}
        >
          {this.renderRemoteAction()}
        </SuggestedActionGroup>
        <SuggestedActionGroup>
          {this.renderMergeInto()}
          {this.renderCherryPickInto()}
        </SuggestedActionGroup>
      </>
    )
  }

  public componentDidMount() {
    this.transitionTimer = window.setTimeout(() => {
      this.setState({ enableTransitions: true })
      this.transitionTimer = null
    }, 500)
  }

  public componentWillUnmount() {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer)
    }
  }

  public render() {
    console.log("no-changes render")
    return (
      <div id="no-changes">
        <div className="content">
          <div className="header">
            <div className="text">
              <h1>No local changes</h1>
              <p>
                There are no uncommitted changes in this repository. Here are
                some friendly suggestions for what to do next.
              </p>
            </div>
            <img src={PaperStackImage} className="blankslate-image" />
          </div>
          {this.renderActions()}
        </div>
      </div>
    )
  }
}
