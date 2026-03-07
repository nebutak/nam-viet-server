import prisma from '../config/prisma';
import { CreateTaskInput, UpdateTaskInput, TaskQueryInput } from '../validators/task.validator';
import { NotFoundError } from '../utils/errors';
import { Prisma } from '@prisma/client';
import notificationService from './notification.service';
import ticketService from './ticket.service';
import { logActivity } from '@utils/logger';

class TaskService {
  // Create new task
  async createTask(userId: number, data: CreateTaskInput) {
    const task = await prisma.crmTask.create({
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

    // Notify assigned
    if (task.assignedToId) {
      notificationService.notifyTaskAssigned({
        taskId: task.id,
        title: task.title,
        assigneeId: task.assignedToId,
        assignerName: task.creator?.fullName || 'Hệ thống',
        dueDate: task.dueDate
      }).catch(console.error);
    }

    // Log activity
    logActivity('create', userId, 'tasks', {
      recordId: task.id,
      newValue: task,
    });

    return task;
  }

  // Get all tasks with pagination
  async getAllTasks(query: TaskQueryInput) {
    const { page = 1, limit = 10, search, status, priority, type, customerId, assignedToId, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CrmTaskWhereInput = {
      deletedAt: null, // Only fetch active tasks
    };

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
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get task by ID
  async getTaskById(id: number) {
    const task = await prisma.crmTask.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedTo: true,
        creator: true,
        relatedTicket: true,
      },
    });

    if (!task || task.deletedAt) {
      throw new NotFoundError('Nhiệm vụ không tồn tại');
    }

    return task;
  }

  // Update task
  async updateTask(id: number, data: UpdateTaskInput, updatedBy?: number) {
    const oldTask = await this.getTaskById(id);

    const updatedTask = await prisma.crmTask.update({
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

    // Notify Assignee Change
    if (updatedTask.assignedToId && updatedTask.assignedToId !== oldTask.assignedToId) {
      notificationService.notifyTaskAssigned({
        taskId: updatedTask.id,
        title: updatedTask.title,
        assigneeId: updatedTask.assignedToId,
        assignerName: 'Hệ thống',
        dueDate: updatedTask.dueDate
      }).catch(console.error);
    }

    // Log activity
    if (updatedBy) {
      logActivity('update', updatedBy, 'tasks', {
        recordId: id,
        oldValue: oldTask,
        newValue: updatedTask,
      });
    }

    // Synchronize ticket status based on task status
    if (updatedTask.relatedTicketId && data.status) {
      let newTicketStatus: any = null;
      if (data.status === 'completed') {
        newTicketStatus = 'resolved';
      } else if (data.status === 'cancelled') {
        newTicketStatus = 'closed';
      }

      if (newTicketStatus) {
        try {
          const ticket = await ticketService.getTicketById(updatedTask.relatedTicketId);
          // Only update if the ticket is not already in that status
          if (ticket.status !== newTicketStatus) {
            await ticketService.updateTicket(
              updatedTask.relatedTicketId,
              { status: newTicketStatus },
              updatedBy || 1 // fallback to system user 1 if updatedBy is not available
            );
          }
        } catch (error) {
          console.error("Failed to sync ticket status from task", error);
        }
      }
    }

    return updatedTask;
  }

  // Delete task (Soft Delete)
  async deleteTask(id: number, deletedBy?: number) {
    const task = await this.getTaskById(id);

    // Soft delete
    await prisma.crmTask.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Log activity
    if (deletedBy) {
      logActivity('delete', deletedBy, 'tasks', {
        recordId: id,
        oldValue: task,
      });
    }

    return { message: 'Xóa nhiệm vụ thành công' };
  }
}

export default new TaskService();
