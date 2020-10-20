import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Repository } from '../../models/repository'
import { MenuBackedSuggestedAction } from '../suggested-actions'
import { IRepositoryState } from '../../lib/app-state'
import { TipState, IValidBranch } from '../../models/tip'
import { Branch } from '../../models/branch'
import { SuggestedActionGroup } from '../suggested-actions'
import { PopupType } from '../../models/popup'
import { connect, dispatcher, IGlobalState } from '../index'

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

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

interface Iprops {
  /**
   * The currently selected repository
   */
  readonly repository: Repository

  /**
   * An object describing the current state of
   * the selected repository. Used to determine
   * whether to render push, pull, publish, or
   * 'open pr' actions.
   */
  readonly repositoryState: IRepositoryState
}

const mapStateToProps = (state: IGlobalState): Iprops => {
  return {
    repository: state.appStore.selectedRepository as Repository,
    repositoryState: state.appStore.possibleSelectedState!.state!
  }
}

/** The component to display when there are no local changes. */
class LocalNoChanges extends React.PureComponent<Iprops> {
  /**
   * ID for the timer that's activated when the component
   * mounts. See componentDidMount/componentWillUnmount.
   */
  private transitionTimer: number | null = null

  public constructor(props: Iprops) {
    super(props)
  }

  private currentBranch = (): Branch | null => {
    const { branchesState } = this.props.repositoryState
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


  private renderActions() {
    return (
      <>
        <SuggestedActionGroup>
          {this.renderMergeInto()}
          {this.renderCherryPickInto()}
        </SuggestedActionGroup>
      </>
    )
  }

  public componentDidMount() {
    this.transitionTimer = window.setTimeout(() => {
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

export const NoChanges = connect(mapStateToProps)(LocalNoChanges)