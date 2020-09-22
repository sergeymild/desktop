import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { iconForStatus, Octicon } from '../octicons'
import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'

interface IProps {
  readonly onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
  readonly file: CommittedFileChange
  readonly availablePathWidth: number
}

export class FileListItem extends React.Component<IProps> {
  public shouldComponentUpdate(nextProps: Readonly<IProps>, nextState: Readonly<{}>, nextContext: any): boolean {
    return this.props.availablePathWidth !== nextProps.availablePathWidth ||
      this.props.file !== nextProps.file
  }

  public render() {
    const status = this.props.file.status
    const fileStatus = mapStatus(status)

    return (
      <div className="file" onContextMenu={this.props.onContextMenu}>
        <PathLabel
          path={this.props.file.path}
          status={this.props.file.status}
          availableWidth={this.props.availablePathWidth}
        />

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }
}