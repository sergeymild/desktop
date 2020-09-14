import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { dispatcher } from '../index'

export function SuccessfulMerge({
  ourBranch,
  theirBranch,
}: {
  readonly ourBranch: string
  readonly theirBranch?: string
}) {
  const message =
    theirBranch !== undefined ? (
      <span>
        {'Successfully merged '}
        <strong>{theirBranch}</strong>
        {' into '}
        <strong>{ourBranch}</strong>
      </span>
    ) : (
      <span>
        {'Successfully merged into '}
        <strong>{ourBranch}</strong>
      </span>
    )

  return (
    <Banner id="successful-merge" timeout={5000} onDismissed={dispatcher.clearBanner}>
      <div className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
