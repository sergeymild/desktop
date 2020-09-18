import * as React from 'react'
import { PushPullButton } from './push-pull-button'
import { TipState } from '../../models/tip'
import { isCurrentBranchForcePush } from '../../lib/rebase'
import { PossibleSelections, SelectionType } from '../../lib/app-state'
import { RevertProgress } from './revert-progress'
import { connect, IGlobalState } from '../index'

interface IProps {
  readonly selectedState: PossibleSelections | null
}

const mapStateToProps = (state: IGlobalState): IProps => ({
  selectedState: state.appStore.possibleSelectedState
})

class LocalToolbarPushPullButton extends React.Component<IProps, {}> {

  public render() {
    const selection = this.props.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const state = selection.state
    const revertProgress = state.revertProgress
    if (revertProgress) {
      return <RevertProgress progress={revertProgress} />
    }

    let remoteName = state.remote ? state.remote.name : null
    const progress = state.pushPullFetchProgress

    const { conflictState } = state.changesState

    const rebaseInProgress =
      conflictState !== null && conflictState.kind === 'rebase'

    const { aheadBehind, branchesState } = state
    const { pullWithRebase, tip } = branchesState

    if (tip.kind === TipState.Valid && tip.branch.remote !== null) {
      remoteName = tip.branch.remote
    }

    const isForcePush = isCurrentBranchForcePush(branchesState, aheadBehind)


    return (
      <PushPullButton
        repository={selection.repository}
        aheadBehind={state.aheadBehind}
        numTagsToPush={state.tagsToPush !== null ? state.tagsToPush.length : 0}
        remoteName={remoteName}
        lastFetched={state.lastFetched}
        networkActionInProgress={state.isPushPullFetchInProgress}
        progress={progress}
        tipState={tip.kind}
        pullWithRebase={pullWithRebase}
        rebaseInProgress={rebaseInProgress}
        isForcePush={isForcePush}
      />
    )
  }
}

export const ToolbarPushPullButton =
  connect(mapStateToProps)(LocalToolbarPushPullButton)