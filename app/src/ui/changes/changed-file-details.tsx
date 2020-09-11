import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { DiffType, LineEndingsChange } from '../../models/diff'
import { Octicon, OcticonSymbol, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'

interface IProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diffKing?: DiffType
  readonly lineEndingsChange?: LineEndingsChange
}

/** Displays information about a file */
export class ChangedFileDetails extends React.Component<IProps, {}> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status} />
        {this.renderDecorator()}

        <Octicon
          symbol={iconForStatus(status)}
          className={`status status-${fileStatus.toLowerCase()}`}
          title={fileStatus}
        />
      </div>
    )
  }

  private renderDecorator() {
    const {diffKing, lineEndingsChange} = this.props

    if (diffKing === undefined) { return null }

    if (diffKing === DiffType.Text && lineEndingsChange !== undefined) {
      const message = `Warning: line endings will be changed from '${lineEndingsChange.from}' to '${lineEndingsChange.to}'.`
      return (
        <Octicon
          symbol={OcticonSymbol.alert}
          className={'line-endings'}
          title={message}
        />
      )
    } else {
      return null
    }
  }
}
