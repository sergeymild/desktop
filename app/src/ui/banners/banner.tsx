import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { dispatcher } from '../index'

interface IBannerProps {
  readonly id?: string
  readonly timeout?: number
  readonly dismissable?: boolean
  readonly onDismissed?: () => void
}

export class Banner extends React.Component<IBannerProps, {}> {
  private timeoutId: number | null = null

  public render() {
    return (
      <div id={this.props.id} className="banner">
        <div className="contents">{this.props.children}</div>
        {this.renderCloseButton()}
      </div>
    )
  }

  private dismiss = () => {
    if (this.props.dismissable === false) return
    if (this.props.onDismissed) {
      return this.props.onDismissed()
    }
    dispatcher.clearBanner()
  }

  private renderCloseButton() {
    const { dismissable } = this.props
    if (dismissable === undefined || dismissable === false) {
      return null
    }

    return (
      <div className="close">
        <a onClick={this.dismiss}>
          <Octicon symbol={OcticonSymbol.x} />
        </a>
      </div>
    )
  }

  public componentDidMount = () => {
    if (this.props.timeout !== undefined) {
      this.timeoutId = window.setTimeout(() => {
        this.dismiss()
      }, this.props.timeout)
    }
  }

  public componentWillUnmount = () => {
    if (this.props.timeout !== undefined && this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId)
    }
  }
}
