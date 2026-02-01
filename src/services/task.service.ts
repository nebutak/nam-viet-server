import prisma from '../config/prisma';
import { CreateTaskInput, UpdateTaskInput, TaskQueryInput } from '../validators/task.validator';
import { NotFoundError } from '../utils/errors';
import { Prisma } from '@prisma/client';

class TaskService {
  async create(userId: number, data: CreateTaskInput) {
    return await prisma.crmTask.create({
      data: {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: data.priority,
        type: data.type,
        customerId: data.customerId,
        assignedToId: data.assignedToId,
        relatedTicketId: data.relatedTicketId,
        createdBy: userId,
      },
      include: {
        customer: true,
        assignedTo: true,
        creator: true,
      },
    });
  }

  async findAll(query: TaskQueryInput) {
    const { page = 1, limit = 10, search, status, priority, type, customerId, assignedToId, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CrmTaskWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { customer: { customerName: { contains: search } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (type) {
        where.type = type;
    }

    if (customerId) {
        where.customerId = customerId;
    }

    if (assignedToId) {
        where.assignedToId = assignedToId;
    }

    const [tasks, total] = await Promise.all([
      prisma.crmTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: { select: { id: true, customerName: true, phone: true } },
          assignedTo: { select: { id: true, fullName: true, email: true } },
          creator: { select: { id: true, fullName: true } },
          relatedTicket: { select: { id: true, ticketCode: true, title: true } },
        },
      }),
      prisma.crmTask.count({ where }),
    ]);

    return {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const task = await prisma.crmTask.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedTo: true,
        creator: true,
        relatedTicket: true,
      },
    });

    if (!task) {
      throw new NotFoundError('Nhiệm vụ không tồn tại');
    }

    return task;
  }

  async update(id: number, data: UpdateTaskInput) {
    await this.findOne(id);

    return await prisma.crmTask.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
      include: {
        customer: true,
        assignedTo: true,
        relatedTicket: true,
      },
    });
  }

  async delete(id: number) {
    await this.findOne(id);
    return await prisma.crmTask.delete({
      where: { id },
    });
  }
}

export default new TaskService();
