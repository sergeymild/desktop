import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

export function BranchAlreadyUpToDate({
  ourBranch,
  theirBranch,
}: {
  readonly ourBranch: string
  readonly theirBranch?: string
}) {
  const message =
    theirBranch !== undefined ? (
      <span>
        <strong>{ourBranch}</strong>
        {' is already up to date with '}
        <strong>{theirBranch}</strong>
      </span>
    ) : (
      <span>
        <strong>{ourBranch}</strong>
        {' is already up to date'}
      </span>
    )

  return (
    <Banner id="successful-merge" timeout={5000}>
      <div className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
