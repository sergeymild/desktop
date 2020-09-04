import * as React from 'react'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { getCommits } from '../../lib/git'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { RichText } from '../lib/rich-text'
import { CommitAttribution } from '../lib/commit-attribution'
import { RelativeTime } from '../relative-time'
import { getAvatarUsersForCommit, IAvatarUser } from '../../models/avatar'
import { AvatarStack } from '../lib/avatar-stack'
import { Dispatcher } from '../dispatcher'

interface ICherryPickCommitListProps {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null
  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch
  readonly repository: Repository
  /** The GitHub repository associated with this commit (if found) */
  readonly gitHubRepository: GitHubRepository | null
  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, string>
  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly dispatcher: Dispatcher
  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface ICommitItem extends IFilterListItem {
  readonly commit: Commit
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
  readonly id: string
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

  public async componentDidMount() {
    console.log(this.props.selectedBranch?.name)
    const localCommits = await getCommits(this.props.repository, this.props.selectedBranch!.name, 100, [
      '--not',
      '--remotes',
    ])

    this.createTagsGroup(localCommits)
  }

  private createTagsGroup = (tags: ReadonlyArray<Commit>) => {
    const groups = new Array<IFilterListGroup<ICommitItem>>()
    const group: IFilterListGroup<ICommitItem> = {
      identifier: 'Tags',
      items: tags.map(k => (
        {
          id: k.sha,
          commit: k, text: [k.summary, k.sha],
          avatarUsers: getAvatarUsersForCommit(null, k)
        })),
    }


    groups.push(group)
    this.setState({
      ...this.state,
      groups,
      commits: tags,
    })
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({ ...this.state, filterText: text })
  }

  private renderRelativeTime = (date: Date) => {
    return (
      <>
        {` • `}
        <RelativeTime date={date} abbreviate={true}/>
      </>
    )
  }

  private renderItem = (item: ICommitItem, matches: IMatches): JSX.Element => {
    return (
      <div className="commit">
        <div className="info">
          <RichText
            className="summary"
            emoji={this.props.emoji}
            text={item.commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="description">
            <AvatarStack users={item.avatarUsers} />
            <div className="byline">
              <CommitAttribution
                gitHubRepository={this.props.gitHubRepository}
                commit={item.commit}
              />
              {this.renderRelativeTime(item.commit.author.date)}
            </div>
          </div>
        </div>

      </div>
    )
  }

  private onSelectionChanged = async (item: ICommitItem | null) => {
    if (item === null) { return }
    this.setState({...this.state, selectedItem: item})
  }

  private merge = () => {
    const commit = this.state.selectedItem
    const branch = this.props.selectedBranch?.name
    console.log(commit, this.props.selectedBranch)
    if (!commit) { return }
    if (!branch) { return }
    this.props.dispatcher.cherryPick(
      this.props.repository,
      commit.commit.sha,
      branch,
      null
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
          <div id="commit-list">
            <FilterList<ICommitItem>
              className="cherry-pick-commit-list"
              rowHeight={50}
              filterText={this.state.filterText}
              onFilterTextChanged={this.onFilterTextChanged}
              selectedItem={this.state.selectedItem}
              onSelectionChanged={this.onSelectionChanged}
              renderItem={this.renderItem}
              groups={this.state.groups}
              invalidationProps={''}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              <>
                Cherry pick {' '}
              </>
            }
            okButtonDisabled={false}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}