import prisma from '../config/prisma';
import { CreateTicketInput, UpdateTicketInput, TicketQueryInput } from '../validators/ticket.validator';
import { NotFoundError } from '../utils/errors';
import { Prisma } from '@prisma/client';

class TicketService {
  async create(userId: number, data: CreateTicketInput) {
    // Generate unique code (Simple logic: TCK-TIMESTAMP)
    // improved: TCK-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await prisma.ticket.count({
        where: {
            createdAt: {
                gte: new Date(new Date().setHours(0,0,0,0))
            }
        }
    });
    const ticketCode = `TCK-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

    return await prisma.ticket.create({
      data: {
        ticketCode,
        title: data.title,
        description: data.description,
        priority: data.priority,
        customerId: data.customerId,
        assignedToId: data.assignedToId,
        createdBy: userId,
      },
      include: {
        customer: true,
        assignedTo: true,
        creator: true,
      },
    });
  }

  async findAll(query: TicketQueryInput) {
    const { page = 1, limit = 10, search, status, priority, customerId, assignedToId, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TicketWhereInput = {};

    if (search) {
      where.OR = [
        { ticketCode: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
        { customer: { customerName: { contains: search } } }, // Search by customer name
      ];
    }

    if (status && status !== 'all') {
      where.status = status as any;
    }

    if (priority) {
      where.priority = priority;
    }

    if (customerId) {
        where.customerId = customerId;
    }

    if (assignedToId) {
        where.assignedToId = assignedToId;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: { select: { id: true, customerName: true, phone: true } },
          assignedTo: { select: { id: true, fullName: true, email: true } },
          creator: { select: { id: true, fullName: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedTo: true,
        creator: true,
        tasks: true, // Include related tasks
      },
    });

    if (!ticket) {
      throw new NotFoundError('Phiếu hỗ trợ không tồn tại');
    }

    return ticket;
  }

  async update(id: number, data: UpdateTicketInput) {
    await this.findOne(id);

    return await prisma.ticket.update({
      where: { id },
      data: {
        ...data,
      },
      include: {
        customer: true,
        assignedTo: true,
      },
    });
  }

  async delete(id: number) {
    await this.findOne(id);
    return await prisma.ticket.delete({
      where: { id },
    });
  }
}

export default new TicketService();
