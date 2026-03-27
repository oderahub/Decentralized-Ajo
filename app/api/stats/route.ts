import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, extractToken } from '@/lib/auth';
import { redisClient } from '@/lib/redis';

export async function GET(request: NextRequest) {
  const token = extractToken(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const userId = payload.userId;

  try {
    // Try to get cached stats first
    const cachedStats = await redisClient.getCachedStats(userId);
    if (cachedStats) {
      return NextResponse.json(cachedStats);
    }

    // Use optimized query with materialized view if available, fallback to regular query
    let stats;
    
    try {
      // Try to use materialized view first (much faster)
      const materializedStats = await prisma.$queryRaw`
        SELECT * FROM user_dashboard_stats 
        WHERE "userId" = ${userId}
      `;
      
      if (materializedStats && materializedStats.length > 0) {
        const statsRow = materializedStats[0];
        stats = {
          activeCircles: parseInt(statsRow.activeCircles),
          totalContributed: parseFloat(statsRow.totalContributed),
          contributionCount: parseInt(statsRow.contributionCount),
          totalMembers: parseInt(statsRow.totalMembers),
          totalWithdrawn: parseFloat(statsRow.totalWithdrawn),
        };
      }
    } catch (materializedError) {
      console.log('Materialized view not available, using regular query:', (materializedError as Error).message);
    }

    // Fallback to regular optimized query if materialized view fails
    if (!stats) {
      const [activeCircles, contributionStats, memberStats, withdrawalStats] = await prisma.$transaction([
        // Count active circles where user is a member (optimized with indexes)
        prisma.circle.count({
          where: {
            OR: [
              { organizerId: userId },
              { members: { some: { userId: userId, status: 'ACTIVE' } } },
            ],
            status: 'ACTIVE',
          },
        }),
        
        // Sum of user's completed contributions (using partial index)
        prisma.contribution.aggregate({
          where: {
            userId: userId,
            status: 'COMPLETED',
          },
          _sum: { amount: true },
          _count: true,
        }),
        
        // Total members across user's circles (optimized query)
        prisma.circleMember.count({
          where: {
            circle: {
              OR: [
                { organizerId: userId },
                { members: { some: { userId: userId, status: 'ACTIVE' } } },
              ],
            },
            status: 'ACTIVE',
          },
        }),
        
        // Total withdrawals (using partial index)
        prisma.withdrawal.aggregate({
          where: {
            userId: userId,
            status: 'COMPLETED',
          },
          _sum: { amount: true },
        }),
      ]);

      stats = {
        activeCircles,
        totalContributed: contributionStats._sum.amount || 0,
        contributionCount: contributionStats._count,
        totalMembers: memberStats,
        totalWithdrawn: withdrawalStats._sum.amount || 0,
      };
    }

    // Cache the results for 5 minutes (300 seconds)
    await redisClient.cacheStats(userId, stats, 300);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
