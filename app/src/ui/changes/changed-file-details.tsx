import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { DiffType, LineEndingsChange } from '../../models/diff'
import { iconForStatus, Octicon, OcticonSymbol } from '../octicons'
import { mapStatus } from '../../lib/status'
import { dispatcher } from '../index'
import { Select } from '../lib/select'

interface IProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diffKing?: DiffType
  readonly lineEndingsChange?: LineEndingsChange
  readonly unified: number
}

/** Displays information about a file */
export class ChangedFileDetails extends React.Component<IProps, {}> {
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

  private updateUnifiedCount(event: React.FormEvent<HTMLSelectElement>) {
    dispatcher.updateUnifiedCount(parseInt(event.currentTarget.value, 10))
  }

  private renderSelectUnifiedCount() {
    return <Select
      label={"Context"}
      value={`${this.props.unified}`}
      onChange={this.updateUnifiedCount}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </Select>
  }

  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status!)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status!} />
        {this.renderDecorator()}
        {this.renderSelectUnifiedCount()}
        <Octicon
          symbol={iconForStatus(status!)}
          className={`status status-${fileStatus.toLowerCase()}`}
          title={fileStatus}
        />
      </div>
    )
  }
}
