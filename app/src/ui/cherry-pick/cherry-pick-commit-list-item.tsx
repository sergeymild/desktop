import * as React from 'react'
import { IFilterListItem } from '../lib/filter-list'
import { Commit } from '../../models/commit'
import { IAvatarUser } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { AvatarStack } from '../lib/avatar-stack'
import { CommitAttribution } from '../lib/commit-attribution'
import { RelativeTime } from '../relative-time'
import { IMatches } from '../../lib/fuzzy-find'
import { GitHubRepository } from '../../models/github-repository'

export interface ICommitItem extends IFilterListItem {
  readonly commit: Commit
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
  readonly id: string
}

interface ICherryPickCommitListItemProps {
  readonly commit: ICommitItem,
  readonly matches: IMatches,
  readonly gitHubRepository: GitHubRepository | null
}

export class CherryPickCommitListItem extends React.Component<ICherryPickCommitListItemProps,{}> {

  private renderRelativeTime = (date: Date) => {
    return (
      <>
        {` • `}
        <RelativeTime date={date} abbreviate={true}/>
      </>
    )
  }

  public render() {
    return (
      <div className="commit">
        <div className="info">
          <RichText
            className="summary"
            text={this.props.commit.commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="description">
            <AvatarStack users={this.props.commit.avatarUsers} />
            <div className="byline">
              <CommitAttribution
                gitHubRepository={this.props.gitHubRepository}
                commit={this.props.commit.commit}
              />
              {this.renderRelativeTime(this.props.commit.commit.author.date)}
            </div>
          </div>
        </div>

      </div>
    )
  }
}