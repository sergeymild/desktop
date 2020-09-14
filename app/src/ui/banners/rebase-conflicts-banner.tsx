import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { LinkButton } from '../lib/link-button'
import { dispatcher } from '../index'

interface IProps {
  /** branch the user is rebasing into */
  readonly targetBranch: string
  /** callback to fire when the dialog should be reopened */
  readonly onOpenDialog: () => void
}

export class RebaseConflictsBanner extends React.Component<IProps, {}> {
  private openDialog = async () => {
    dispatcher.clearBanner()
    this.props.onOpenDialog()
  }

  private onDismissed = () => {
    log.warn(
      `[RebaseConflictsBanner] this is not dismissable by default unless the user clicks on the link`
    )
  }

  public render() {
    return (
      <Banner
        id="rebase-conflicts-banner"
        dismissable={false}
        onDismissed={this.onDismissed}
      >
        <Octicon className="alert-icon" symbol={OcticonSymbol.alert} />
        <div className="banner-message">
          <span>
            Resolve conflicts to continue rebasing{' '}
            <strong>{this.props.targetBranch}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </Banner>
    )
  }
}
