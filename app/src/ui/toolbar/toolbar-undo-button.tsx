import * as React from 'react'
import { OcticonSymbol } from '../octicons'
import { ToolbarButton } from './button'
import { connect, IGlobalState } from '../index'
import { Commit } from '../../models/commit'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

interface IProps {
  readonly commit: Commit | null
  readonly repository: Repository | null
  readonly isPushPullFetchInProgress: boolean
  readonly isCommitting: boolean
  readonly dispatcher: Dispatcher
}

const mapStateToProps = (state: IGlobalState): IProps => {
  const repository = state.appStore.selectedRepository
  let repo: Repository | null = null
  let commit: Commit | null = null
  if (repository instanceof Repository) {
    commit = state.appStore.getMostRecentCommit(repository)
    repo = repository
  }

  return {
    isPushPullFetchInProgress: state.appStore.possibleSelectedState?.state?.isPushPullFetchInProgress || false,
    isCommitting: state.appStore.possibleSelectedState?.state?.isCommitting || false,
    commit: commit,
    repository: repo,
    dispatcher: state.dispatcher
  }
}

class LocalToolbarUndoButton extends React.Component<IProps> {


  private onClick = async () => {
    const commit = this.props.commit
    const repository = this.props.repository

    if (repository && commit && commit.tags.length === 0) {
      this.props.dispatcher.undoCommit(repository, commit)
    }
  }

  public render() {
    const disabled =
      this.props.isPushPullFetchInProgress ||
      this.props.isCommitting ||
      this.props.commit === null ||
      this.props.repository === null

    return (
      <ToolbarButton
        title="Undo"
        icon={OcticonSymbol.repo}
        onClick={this.onClick}
        disabled={disabled}
        className="vertically"
      />
    )
  }
}

export const ToolbarUndoButton = connect(mapStateToProps)(LocalToolbarUndoButton)