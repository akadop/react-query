import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { queryKey, sleep } from '@tanstack/query-test-utils'
import { InfiniteQueryObserver, QueryClient } from '..'
import type {
  DefaultedInfiniteQueryObserverOptions,
  InfiniteData,
} from '../types'

describe('InfiniteQueryObserver', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  test('should be able to fetch an infinite query with selector', async () => {
    const key = queryKey()
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn: () => sleep(10).then(() => 1),
      select: (data) => ({
        pages: data.pages.map((x) => `${x}`),
        pageParams: data.pageParams,
      }),
      initialPageParam: 1,
      getNextPageParam: () => 2,
    })
    let observerResult
    const unsubscribe = observer.subscribe((result) => {
      observerResult = result
    })
    await vi.advanceTimersByTimeAsync(10)
    unsubscribe()
    expect(observerResult).toMatchObject({
      data: { pages: ['1'], pageParams: [1] },
    })
  })

  test('should pass the meta option to the queryFn', async () => {
    const meta = {
      it: 'works',
    }

    const key = queryKey()
    const queryFn = vi.fn(() => sleep(10).then(() => 1))
    const observer = new InfiniteQueryObserver(queryClient, {
      meta,
      queryKey: key,
      queryFn,
      select: (data) => ({
        pages: data.pages.map((x) => `${x}`),
        pageParams: data.pageParams,
      }),
      initialPageParam: 1,
      getNextPageParam: () => 2,
    })
    let observerResult
    const unsubscribe = observer.subscribe((result) => {
      observerResult = result
    })
    await vi.advanceTimersByTimeAsync(10)
    unsubscribe()
    expect(observerResult).toMatchObject({
      data: { pages: ['1'], pageParams: [1] },
    })
    expect(queryFn).toBeCalledWith(expect.objectContaining({ meta }))
  })

  test('should make getNextPageParam and getPreviousPageParam receive current pageParams', async () => {
    const key = queryKey()
    let single: Array<string> = []
    let all: Array<string> = []
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn: ({ pageParam }) => sleep(10).then(() => String(pageParam)),
      initialPageParam: 1,
      getNextPageParam: (_, __, lastPageParam, allPageParams) => {
        single.push('next' + lastPageParam)
        all.push('next' + allPageParams.join(','))
        return lastPageParam + 1
      },
      getPreviousPageParam: (_, __, firstPageParam, allPageParams) => {
        single.push('prev' + firstPageParam)
        all.push('prev' + allPageParams.join(','))
        return firstPageParam - 1
      },
    })
    await vi.advanceTimersByTimeAsync(10)

    observer.fetchNextPage()
    await vi.advanceTimersByTimeAsync(10)
    observer.fetchPreviousPage()
    await vi.advanceTimersByTimeAsync(10)

    expect(single).toEqual(['next1', 'prev1', 'prev1', 'next1', 'prev0'])
    expect(all).toEqual(['next1', 'prev1', 'prev1', 'next0,1', 'prev0,1'])

    single = []
    all = []

    observer.refetch()
    await vi.advanceTimersByTimeAsync(20)

    expect(single).toEqual(['next0', 'next1', 'prev0'])
    expect(all).toEqual(['next0', 'next0,1', 'prev0,1'])
  })

  test('should not invoke getNextPageParam and getPreviousPageParam on empty pages', () => {
    const key = queryKey()

    const getNextPageParam = vi.fn()
    const getPreviousPageParam = vi.fn()

    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn: ({ pageParam }) => sleep(10).then(() => String(pageParam)),
      initialPageParam: 1,
      getNextPageParam: getNextPageParam.mockImplementation(
        (_, __, lastPageParam) => lastPageParam + 1,
      ),
      getPreviousPageParam: getPreviousPageParam.mockImplementation(
        (_, __, firstPageParam) => firstPageParam - 1,
      ),
    })

    const unsubscribe = observer.subscribe(() => {})

    getNextPageParam.mockClear()
    getPreviousPageParam.mockClear()

    queryClient.setQueryData(key, { pages: [], pageParams: [] })

    expect(getNextPageParam).toHaveBeenCalledTimes(0)
    expect(getPreviousPageParam).toHaveBeenCalledTimes(0)

    unsubscribe()
  })

  test('should stop refetching if undefined is returned from getNextPageParam', async () => {
    const key = queryKey()
    let next: number | undefined = 2
    const queryFn = vi.fn<(...args: Array<any>) => any>(({ pageParam }) =>
      sleep(10).then(() => String(pageParam)),
    )
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn,
      initialPageParam: 1,
      getNextPageParam: () => next,
    })

    observer.fetchNextPage()
    await vi.advanceTimersByTimeAsync(10)
    observer.fetchNextPage()
    await vi.advanceTimersByTimeAsync(10)

    expect(observer.getCurrentResult().data?.pages).toEqual(['1', '2'])
    expect(queryFn).toBeCalledTimes(2)
    expect(observer.getCurrentResult().hasNextPage).toBe(true)

    next = undefined

    observer.refetch()
    await vi.advanceTimersByTimeAsync(10)

    expect(observer.getCurrentResult().data?.pages).toEqual(['1'])
    expect(queryFn).toBeCalledTimes(3)
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
  })

  test('should stop refetching if null is returned from getNextPageParam', async () => {
    const key = queryKey()
    let next: number | null = 2
    const queryFn = vi.fn<(...args: Array<any>) => any>(({ pageParam }) =>
      sleep(10).then(() => String(pageParam)),
    )
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn,
      initialPageParam: 1,
      getNextPageParam: () => next,
    })

    observer.fetchNextPage()
    await vi.advanceTimersByTimeAsync(10)
    observer.fetchNextPage()
    await vi.advanceTimersByTimeAsync(10)

    expect(observer.getCurrentResult().data?.pages).toEqual(['1', '2'])
    expect(queryFn).toBeCalledTimes(2)
    expect(observer.getCurrentResult().hasNextPage).toBe(true)

    next = null

    observer.refetch()
    await vi.advanceTimersByTimeAsync(10)

    expect(observer.getCurrentResult().data?.pages).toEqual(['1'])
    expect(queryFn).toBeCalledTimes(3)
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
  })

  test('should set infinite query behavior via getOptimisticResult and return the initial state', () => {
    const key = queryKey()
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn: () => sleep(10).then(() => 1),
      initialPageParam: 1,
      getNextPageParam: () => 2,
    })

    const options: DefaultedInfiniteQueryObserverOptions<
      number,
      Error,
      InfiniteData<number>,
      typeof key,
      number
    > = {
      queryKey: key,
      queryFn: () => sleep(10).then(() => 1),
      initialPageParam: 1,
      getNextPageParam: () => 2,
      throwOnError: true,
      refetchOnReconnect: false,
      queryHash: key.join(''),
      behavior: undefined,
    }

    const result = observer.getOptimisticResult(options)

    expect(options.behavior).toBeDefined()
    expect(options.behavior?.onFetch).toBeDefined()

    expect(result).toMatchObject({
      data: undefined,
      hasNextPage: false,
      hasPreviousPage: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchingPreviousPage: false,
      isError: false,
      isRefetchError: false,
      isRefetching: false,
    })
  })
})
