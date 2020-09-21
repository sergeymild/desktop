import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { BannerDismissTimeout } from '../../lib/stores'

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
    <Banner id="successful-merge" timeout={BannerDismissTimeout}>
      <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
