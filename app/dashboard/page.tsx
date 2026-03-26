'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Search } from 'lucide-react';
import { authenticatedFetch } from '@/lib/auth-client';
import { useWallet } from '@/lib/wallet-context';
import { Dashboard } from '@/components/dashboard';
import { DashboardStats } from '@/components/dashboard/dashboard-stats';
import { CircleList } from '@/components/dashboard/circle-list';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const PAGE_SIZE = 9;

interface Circle {
  id: string;
  name: string;
  description?: string;
  contributionAmount: number;
  contributionFrequencyDays: number;
  status: string;
  members: { userId: string }[];
  contributions?: { amount: number }[];
}

interface AjoGroup {
  id: string;
  name: string;
  balance: string | number;
  nextCycle: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isConnected } = useWallet();

  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroups, setActiveGroups] = useState<AjoGroup[]>([]);

  // Filter and Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [durationFilter, setDurationFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCircles = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: PAGE_SIZE.toString(),
        status: statusFilter,
        duration: durationFilter,
        sortBy,
        search: searchQuery,
      });

      const response = await authenticatedFetch(`/api/circles?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch circles');
      }

      const data = await response.json();
      setCircles(data.data || []);
      setTotalPages(data.meta?.pages || 1);

      // Filter active circles for dashboard overview
      const activeCircles = data.data?.filter((circle: Circle) => circle.status === 'ACTIVE') || [];
      const activeGroupsData: AjoGroup[] = activeCircles.slice(0, 3).map((circle: Circle) => {
        // Calculate balance from contributions
        const totalBalance = circle.contributions?.reduce((sum, contrib) => sum + contrib.amount, 0) || 0;
        // Mock next cycle for now
        const nextCycle = 'Next payout in 5 days';

        return {
          id: circle.id,
          name: circle.name,
          balance: `${totalBalance.toLocaleString()} XLM`,
          nextCycle,
        };
      });
      setActiveGroups(activeGroupsData);
    } catch (error) {
      console.error('Error fetching circles:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, durationFilter, sortBy, searchQuery]);

  useEffect(() => {
    if (isConnected) {
      fetchCircles();
    } else {
      setLoading(false);
    }
  }, [fetchCircles, isConnected]);

  return (
    <main className="min-h-screen bg-background">
      {/* Use your new Dashboard component to handle Header + Wallet Check + Overview Cards */}
      <Dashboard activeGroups={activeGroups} loading={loading} />

      <div className="container mx-auto px-4 py-12">
        {/* Keeping Main's search and filtering logic below the overview */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold">Explore More Circles</h2>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search circles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-64"
                />
              </div>

              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                  <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <CircleList circles={circles} loading={loading} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  {totalPages > 5 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
