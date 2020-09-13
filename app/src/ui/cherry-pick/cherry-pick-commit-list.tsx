import * as React from 'react'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { IFilterListGroup } from '../lib/filter-list'
import { Dispatcher } from '../dispatcher'
import { ICommitItem } from './cherry-pick-commit-list-item'
import { MergeConflictView } from './merge-conflict-view'
import { SimpleCommitList } from '../history/simple-commit-list'

interface ICherryPickCommitListProps {
  readonly selectedBranch: Branch | null
  readonly currentBranch: Branch
  readonly repository: Repository
  readonly gitHubRepository: GitHubRepository | null
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}


interface ICherryPickCommitListState {
  selectedCommitSha: string | null
  filterText: string,
  commits: ReadonlyArray<Commit>,
  selectedItem: ICommitItem | null,
  readonly groups: ReadonlyArray<IFilterListGroup<ICommitItem>>
}

export class CherryPickCommitList extends React.Component<ICherryPickCommitListProps, ICherryPickCommitListState> {
  public constructor(props: ICherryPickCommitListProps) {
    super(props)

    this.state = {
      selectedCommitSha: null,
      filterText: '',
      commits: [],
      groups: [],
      selectedItem: null,
    }
  }

  private onSelectionChanged = async (item: ICommitItem | null) => {
    if (item === null) {
      return
    }
    this.setState({ ...this.state, selectedItem: item })
  }

  private merge = () => {
    const commit = this.state.selectedItem
    const branch = this.props.selectedBranch?.name
    if (!commit) {
      return
    }
    if (!branch) {
      return
    }
    this.props.dispatcher.cherryPick(
      this.props.repository,
      commit.commit.sha,
      branch,
    )
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="merge"
        onSubmit={this.merge}
        onDismissed={this.props.onDismissed}

        title={
          <>
            Select commit from <strong>{this.props.selectedBranch?.name}</strong>
          </>
        }
      >
        <DialogContent>
          <SimpleCommitList
            repository={this.props.repository}
            gitHubRepository={this.props.gitHubRepository}
            branchName={this.props.selectedBranch!.name}
            onItemSelect={this.onSelectionChanged}
            selectedItem={null}
          />
        </DialogContent>
        <DialogFooter>
          <MergeConflictView
            commitSha={this.state.selectedItem?.commit?.sha}
            selectedBranch={this.props.selectedBranch}
            repository={this.props.repository}
            currentBranch={this.props.currentBranch}
          />
          <OkCancelButtonGroup
            okButtonText={<>Cherry pick {' '}</>}
            okButtonDisabled={false}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}